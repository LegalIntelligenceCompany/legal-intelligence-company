-- Executar no SQL Editor depois de 001 e 002. Pode ser repetido.
begin;

alter table public.contracts add column if not exists byte_size bigint;
alter table public.contracts add column if not exists mime_type text;
alter table public.contracts add column if not exists uploaded_by uuid references auth.users(id);
alter table public.policies add column if not exists updated_at timestamptz not null default now();
alter table public.policies add column if not exists archived_at timestamptz;

create index if not exists contracts_company_date on public.contracts(organization_id, created_at desc);
create index if not exists policies_company_date on public.policies(organization_id, created_at desc);

-- Leitura isolada por empresa. Metadados de contratos só são escritos pelas funções abaixo.
drop policy if exists "members access contracts" on public.contracts;
drop policy if exists "company contracts read" on public.contracts;
create policy "company contracts read" on public.contracts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=contracts.organization_id and m.user_id=auth.uid()));
revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;

-- Políticas: membros lêem, criam e editam; não há eliminação definitiva pela aplicação.
drop policy if exists "members access policies" on public.policies;
create policy "members access policies" on public.policies for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=policies.organization_id and m.user_id=auth.uid()))
with check (exists (select 1 from public.organization_members m where m.organization_id=policies.organization_id and m.user_id=auth.uid()));
revoke all on public.policies from anon, authenticated;
grant select, insert on public.policies to authenticated;
grant update (title, content, archived_at) on public.policies to authenticated;
grant select on public.organizations, public.organization_members to authenticated;

create or replace function public.validate_company_policy() returns trigger
language plpgsql set search_path='' as $$
begin
  new.title := trim(new.title);
  if new.title is null or length(new.title) not between 2 and 160 or new.content is null or length(trim(new.content)) not between 10 and 100000 then
    raise exception 'INVALID_POLICY';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists validate_company_policy on public.policies;
create trigger validate_company_policy before insert or update on public.policies
for each row execute function public.validate_company_policy();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contracts','contracts',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "company contract file read" on storage.objects;
create policy "company contract file read" on storage.objects for select to authenticated
using (bucket_id='contracts' and exists(select 1 from public.contracts c
  join public.organization_members m on m.organization_id=c.organization_id
  where c.storage_path=storage.objects.name and m.user_id=auth.uid()));

drop policy if exists "company contract file upload" on storage.objects;
create policy "company contract file upload" on storage.objects for insert to authenticated
with check (bucket_id='contracts' and exists(select 1 from public.contracts c
  join public.organization_members m on m.organization_id=c.organization_id
  where c.storage_path=storage.objects.name and c.uploaded_by=auth.uid()
    and c.status='uploading' and m.user_id=auth.uid()));

-- Restritivas: regras antigas e mais permissivas não podem abrir este bucket.
drop policy if exists "contracts bucket read boundary" on storage.objects;
create policy "contracts bucket read boundary" on storage.objects as restrictive for select to authenticated
using (bucket_id<>'contracts' or exists(select 1 from public.contracts c
  join public.organization_members m on m.organization_id=c.organization_id
  where c.storage_path=storage.objects.name and m.user_id=auth.uid()));
drop policy if exists "contracts bucket insert boundary" on storage.objects;
create policy "contracts bucket insert boundary" on storage.objects as restrictive for insert to authenticated
with check (bucket_id<>'contracts' or exists(select 1 from public.contracts c
  join public.organization_members m on m.organization_id=c.organization_id
  where c.storage_path=storage.objects.name and c.uploaded_by=auth.uid()
    and c.status='uploading' and m.user_id=auth.uid()));
drop policy if exists "contracts bucket anonymous boundary" on storage.objects;
create policy "contracts bucket anonymous boundary" on storage.objects as restrictive for all to anon
using (bucket_id<>'contracts') with check (bucket_id<>'contracts');
drop policy if exists "contracts bucket immutable update" on storage.objects;
create policy "contracts bucket immutable update" on storage.objects as restrictive for update to public
using (bucket_id<>'contracts') with check (bucket_id<>'contracts');
drop policy if exists "contracts bucket immutable delete" on storage.objects;
create policy "contracts bucket immutable delete" on storage.objects as restrictive for delete to public
using (bucket_id<>'contracts');

create or replace function public.contract_begin(org_id uuid, file_name text, file_bytes bigint, file_mime text)
returns public.contracts language plpgsql security definer set search_path='' as $$
declare result public.contracts; doc_id uuid:=gen_random_uuid(); suffix text;
begin
  if not exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if file_name is null or length(trim(file_name)) not between 1 and 255 or file_bytes is null or file_bytes not between 1 and 20971520 then raise exception 'INVALID_FILE'; end if;
  if file_mime='application/pdf' and lower(file_name) like '%.pdf' then suffix:='pdf';
  elsif file_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and lower(file_name) like '%.docx' then suffix:='docx';
  else raise exception 'INVALID_FILE'; end if;
  insert into public.contracts(id,organization_id,filename,storage_path,status,byte_size,mime_type,uploaded_by)
  values(doc_id,org_id,trim(file_name),org_id::text||'/'||doc_id::text||'.'||suffix,'uploading',file_bytes,file_mime,auth.uid())
  returning * into result;
  return result;
end $$;

create or replace function public.contract_finish(contract_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.contracts;
begin
  select * into doc from public.contracts where id=contract_id for update;
  if not found or not exists(select 1 from public.organization_members where organization_id=doc.organization_id and user_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if doc.status='uploaded' then return; end if;
  if doc.status<>'uploading' then raise exception 'INVALID_STATE'; end if;
  if not exists(select 1 from storage.objects where bucket_id='contracts' and name=doc.storage_path
    and (metadata->>'size')::bigint=doc.byte_size and metadata->>'mimetype'=doc.mime_type) then raise exception 'UPLOAD_INCOMPLETE'; end if;
  update public.contracts set status='uploaded' where id=contract_id;
end $$;

revoke all on function public.contract_begin(uuid,text,bigint,text), public.contract_finish(uuid), public.validate_company_policy() from public, anon;
grant execute on function public.contract_begin(uuid,text,bigint,text), public.contract_finish(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
