-- Executar depois de 001, 002 e 003. Não elimina contratos, políticas ou relatórios.
begin;
create table if not exists public.contract_analyses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null check (status in ('processing','completed','failed')),
  created_at timestamptz not null default now(),
  lease_until timestamptz not null default (now()+interval '5 minutes'),
  finished_at timestamptz,
  model text not null,
  policy_snapshot jsonb not null default '[]'::jsonb,
  report jsonb,
  error_code text,
  check ((status='completed' and report is not null) or (status<>'completed' and report is null))
);
create index if not exists analyses_contract_date on public.contract_analyses(contract_id,created_at desc);
create index if not exists analyses_company_date on public.contract_analyses(organization_id,created_at desc);
alter table public.contract_analyses enable row level security;
drop policy if exists "company analysis read" on public.contract_analyses;
create policy "company analysis read" on public.contract_analyses for select to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=contract_analyses.organization_id and m.user_id=auth.uid()));
revoke all on public.contract_analyses from public, anon, authenticated;
grant select on public.contract_analyses to authenticated;
grant select,insert,update on public.contract_analyses to service_role;

-- Apenas o backend autenticado com service_role pode iniciar/finalizar trabalho.
-- actor_id vem de auth.getUser() no servidor, nunca do corpo do pedido.
create or replace function public.analysis_begin(actor_id uuid, target_contract uuid, target_org uuid, model_name text, new_analysis boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc public.contracts; job public.contract_analyses; snapshots jsonb; policy_count integer; policy_chars bigint;
begin
  if not exists(select 1 from public.organization_members where organization_id=target_org and user_id=actor_id) then raise exception 'FORBIDDEN'; end if;
  select * into doc from public.contracts where id=target_contract and organization_id=target_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  if doc.status<>'uploaded' then raise exception 'UPLOAD_INCOMPLETE'; end if;
  if doc.mime_type is distinct from 'application/pdf' or doc.byte_size is null or doc.byte_size not between 1 and 10485760 then raise exception 'UNSUPPORTED_FILE'; end if;
  if model_name is null or length(model_name) not between 1 and 100 then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_org::text, 904));
  update public.contract_analyses set status='failed',error_code='TIMEOUT',finished_at=now()
    where organization_id=target_org and status='processing' and lease_until<=now();
  select * into job from public.contract_analyses where contract_id=target_contract order by created_at desc limit 1;
  if found and (job.status='processing' or (job.status='completed' and not new_analysis)) then
    return jsonb_build_object('created',false,'job',to_jsonb(job));
  end if;
  if exists(select 1 from public.contract_analyses where organization_id=target_org and status='processing') then raise exception 'ANALYSIS_BUSY'; end if;
  if (select count(*) from public.contract_analyses where organization_id=target_org and created_at>now()-interval '24 hours')>=20 then raise exception 'RATE_LIMITED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'content',p.content,'updated_at',p.updated_at) order by p.id),'[]'::jsonb), count(*),coalesce(sum(length(p.content)+length(p.title)),0)
  into snapshots,policy_count,policy_chars from public.policies p where p.organization_id=target_org and p.archived_at is null;
  if policy_count>30 or policy_chars>50000 then raise exception 'POLICIES_TOO_LARGE'; end if;
  insert into public.contract_analyses(contract_id,organization_id,requested_by,status,model,policy_snapshot)
  values(target_contract,target_org,actor_id,'processing',model_name,snapshots) returning * into job;
  return jsonb_build_object('created',true,'job',to_jsonb(job));
end $$;

create or replace function public.analysis_finish(job_id uuid, actor_id uuid, result_report jsonb, failure_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare job public.contract_analyses;
begin
  select * into job from public.contract_analyses where id=job_id for update;
  if not found or job.requested_by is distinct from actor_id or job.status<>'processing' or job.lease_until<=now() then return false; end if;
  if not exists(select 1 from public.organization_members where organization_id=job.organization_id and user_id=actor_id) then
    update public.contract_analyses set status='failed',finished_at=now(),error_code='FORBIDDEN' where id=job_id;
    return false;
  end if;
  if failure_code is null then
    if result_report is null or jsonb_typeof(result_report) is distinct from 'object' or jsonb_typeof(result_report->'findings') is distinct from 'array' or (result_report->>'document_readable') is distinct from 'true' then raise exception 'INVALID_REPORT'; end if;
    if octet_length(result_report::text)>200000 or jsonb_array_length(result_report->'findings')>20 then raise exception 'INVALID_REPORT'; end if;
    update public.contract_analyses set status='completed',report=result_report,finished_at=now(),error_code=null where id=job_id;
  else
    update public.contract_analyses set status='failed',report=null,finished_at=now(),error_code=left(failure_code,80) where id=job_id;
  end if;
  return true;
end $$;

revoke all on function public.analysis_begin(uuid,uuid,uuid,text,boolean), public.analysis_finish(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.analysis_begin(uuid,uuid,uuid,text,boolean), public.analysis_finish(uuid,uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
