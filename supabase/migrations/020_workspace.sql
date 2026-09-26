-- Durable event receipts and searchable, versioned case knowledge. No AI calls.
begin;
create table if not exists public.research_delivery_receipts (
 event_id text primary key check(length(event_id) between 1 and 200),
 response_id text not null,
 job_id uuid not null references public.research_jobs(id) on delete cascade,
 received_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.research_delivery_receipts enable row level security;
revoke all on public.research_delivery_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.research_delivery_receipts to service_role;
create index if not exists research_jobs_response on public.research_jobs(response_id) where response_id is not null;

-- Repeating a confirmed/uncertain save with identical content is safe. A reused
-- ID cannot overwrite content or attribute another person's entry to the caller.
create or replace function public.research_append(p_dossier uuid,p_id uuid,p_title text,p_body text,p_sources jsonb,p_revision uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner_user uuid; prior public.research_entries;
begin
 select owner_id into owner_user from public.research_dossiers where id=p_dossier for update;
 if not found or not public.research_can_edit(p_dossier) then raise exception 'FORBIDDEN'; end if;
 select * into prior from public.research_entries where id=p_id;
 if found then
  if prior.dossier_id=p_dossier and prior.owner_id=owner_user and prior.created_by=auth.uid()
   and prior.title=p_title and prior.body=p_body and prior.sources=p_sources and prior.revision_of is not distinct from p_revision then return; end if;
  raise exception 'FORBIDDEN';
 end if;
 insert into public.research_entries(id,owner_id,dossier_id,title,body,sources,revision_of) values(p_id,owner_user,p_dossier,p_title,p_body,p_sources,p_revision);
end $$;
revoke all on function public.research_append(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.research_append(uuid,uuid,text,text,jsonb,uuid) to authenticated;

create or replace function public.research_entry_text(p_body text) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;
begin
 if left(trim(p_body),1)='{' then
  begin v:=p_body::jsonb; exception when invalid_text_representation then return p_body; end;
  if v->>'type'='lic-case-v1' then return coalesce(v->>'text','')||' '||coalesce(v->>'reference','')||' '||coalesce(v->>'jurisdiction',''); end if;
 end if;
 return p_body;
end $$;
revoke all on function public.research_entry_text(text) from public,anon;
grant execute on function public.research_entry_text(text) to authenticated,service_role;
alter table public.research_entries add column if not exists search_document tsvector generated always as
 (to_tsvector('portuguese',coalesce(title,'')||' '||coalesce(public.research_entry_text(body),''))) stored;
create index if not exists research_entries_search on public.research_entries using gin(search_document);
create or replace function public.research_search(p_query text,p_dossier uuid default null)
returns table(id uuid,dossier_id uuid,title text,body text,created_at timestamptz,rank real)
language sql stable security invoker set search_path='' as $$
 select e.id,e.dossier_id,e.title,left(public.research_entry_text(e.body),4000),e.created_at,
 ts_rank_cd(e.search_document,websearch_to_tsquery('portuguese',left(p_query,200)))
 from public.research_entries e
 where length(trim(p_query)) between 2 and 200 and (p_dossier is null or e.dossier_id=p_dossier)
 and e.search_document @@ websearch_to_tsquery('portuguese',left(p_query,200))
 order by 6 desc,e.created_at desc limit 50;
$$;
revoke all on function public.research_search(text,uuid) from public,anon;
grant execute on function public.research_search(text,uuid) to authenticated;

create table if not exists public.research_audit (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 dossier_id uuid not null,
 entry_id uuid,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 occurred_at timestamptz not null default now()
);
alter table public.research_audit enable row level security;
revoke all on public.research_audit from public,anon,authenticated;
grant select on public.research_audit to authenticated;
grant select,delete on public.research_audit to service_role;
drop policy if exists research_audit_owner on public.research_audit;
create policy research_audit_owner on public.research_audit for select to authenticated using(owner_id=auth.uid());
create or replace function public.research_audit_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  if not exists(select 1 from auth.users where id=old.owner_id) then return old; end if;
  insert into public.research_audit(owner_id,actor_id,dossier_id,entry_id,operation) values(old.owner_id,auth.uid(),old.dossier_id,old.id,tg_op);
  return old;
 end if;
 insert into public.research_audit(owner_id,actor_id,dossier_id,entry_id,operation) values(new.owner_id,auth.uid(),new.dossier_id,new.id,tg_op);
 return new;
end $$;
revoke all on function public.research_audit_write() from public,anon,authenticated;
drop trigger if exists research_entry_audit on public.research_entries;
create trigger research_entry_audit after insert or update or delete on public.research_entries for each row execute function public.research_audit_write();
-- No document text in the log. Account deletion cascades these records.
notify pgrst,'reload schema';
commit;
