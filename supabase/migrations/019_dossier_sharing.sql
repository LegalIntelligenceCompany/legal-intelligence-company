-- Explicit viewer/editor sharing with existing team members. Never public links.
begin;
create table if not exists public.research_dossier_access (
 dossier_id uuid not null references public.research_dossiers(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 member_id uuid not null references auth.users(id) on delete cascade,
 granted_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(dossier_id,organization_id,member_id)
);
alter table public.research_dossier_access add column if not exists access_role text not null default 'viewer' check(access_role in ('viewer','editor'));
alter table public.research_entries add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.research_entries add column if not exists revision_of uuid references public.research_entries(id) on delete set null;
-- Historical rows keep unknown authorship; never guess an author on re-install.
revoke update on public.research_entries from authenticated;
alter table public.research_dossier_access enable row level security;
create index if not exists research_access_recipient on public.research_dossier_access(member_id,access_role);
revoke all on public.research_dossier_access from public,anon,authenticated;

create or replace function public.research_can_read(p_dossier uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.research_dossier_access a
  join public.research_dossiers d on d.id=a.dossier_id and d.owner_id=a.granted_by
  join public.organization_members recipient on recipient.organization_id=a.organization_id and recipient.user_id=a.member_id
  join public.organization_members sender on sender.organization_id=a.organization_id and sender.user_id=a.granted_by
  where a.dossier_id=p_dossier and a.member_id=auth.uid()
 );
$$;
revoke all on function public.research_can_read(uuid) from public,anon;
grant execute on function public.research_can_read(uuid) to authenticated;
drop policy if exists research_dossiers_shared_read on public.research_dossiers;
create policy research_dossiers_shared_read on public.research_dossiers for select to authenticated using(public.research_can_read(id));
drop policy if exists research_entries_shared_read on public.research_entries;
create policy research_entries_shared_read on public.research_entries for select to authenticated using(public.research_can_read(dossier_id));

drop function if exists public.research_share(uuid,uuid,uuid,boolean);
create or replace function public.research_share(p_dossier uuid,p_org uuid,p_member uuid,p_allow boolean,p_role text default 'viewer')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_allow is null or not exists(select 1 from public.research_dossiers where id=p_dossier and owner_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
 -- Serialize granting with deleting the dossier; check again after taking lock.
 perform 1 from public.research_dossiers where id=p_dossier and owner_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if not p_allow then
  delete from public.research_dossier_access where dossier_id=p_dossier and organization_id=p_org and member_id=p_member;
  return;
 end if;
 if p_role is null or p_role not in ('viewer','editor') or p_member is null or p_member=auth.uid() or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid()) or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_member) then raise exception 'FORBIDDEN'; end if;
 if (select count(*) from public.research_dossier_access where dossier_id=p_dossier)>=100 and not exists(select 1 from public.research_dossier_access where dossier_id=p_dossier and organization_id=p_org and member_id=p_member) then raise exception 'SHARE_LIMIT'; end if;
 insert into public.research_dossier_access(dossier_id,organization_id,member_id,granted_by,access_role) values(p_dossier,p_org,p_member,auth.uid(),p_role) on conflict(dossier_id,organization_id,member_id) do update set access_role=excluded.access_role;
end $$;

create or replace function public.research_access_state(p_dossier uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.research_dossiers where id=p_dossier and owner_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('organization_id',a.organization_id,'member_id',a.member_id,'access_role',a.access_role,'created_at',a.created_at,'active',public.research_share_active(a.organization_id,a.granted_by,a.member_id))) from public.research_dossier_access a where a.dossier_id=p_dossier),'[]'::jsonb);
end $$;
-- Removed memberships invalidate access on the next read. The owner can still
-- revoke an inactive grant; re-joining must not silently restore a former grant.
create or replace function public.research_share_active(p_org uuid,p_owner uuid,p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_owner)
 and exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_member);
$$;
create or replace function public.research_revoke_departed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.research_dossier_access where organization_id=old.organization_id and (member_id=old.user_id or granted_by=old.user_id);
 return old;
end $$;
drop trigger if exists research_member_departed on public.organization_members;
create trigger research_member_departed after delete on public.organization_members for each row execute function public.research_revoke_departed();
drop trigger if exists research_member_changed on public.organization_members;
create trigger research_member_changed after update of organization_id,user_id on public.organization_members for each row when (old.organization_id is distinct from new.organization_id or old.user_id is distinct from new.user_id) execute function public.research_revoke_departed();
revoke all on function public.research_share_active(uuid,uuid,uuid),public.research_revoke_departed() from public,anon,authenticated;
create or replace function public.research_can_edit(p_dossier uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.research_dossiers where id=p_dossier and owner_id=auth.uid()) or exists(
 select 1 from public.research_dossier_access a join public.research_dossiers d on d.id=a.dossier_id and d.owner_id=a.granted_by
 where a.dossier_id=p_dossier and a.member_id=auth.uid() and a.access_role='editor' and public.research_share_active(a.organization_id,a.granted_by,a.member_id)));
$$;
create or replace function public.research_editable_dossiers() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(allowed.id),'[]'::jsonb) from (
 select id from public.research_dossiers where owner_id=auth.uid()
 union select a.dossier_id from public.research_dossier_access a join public.research_dossiers d on d.id=a.dossier_id and d.owner_id=a.granted_by
 where a.member_id=auth.uid() and a.access_role='editor' and public.research_share_active(a.organization_id,a.granted_by,a.member_id)
 ) allowed;
$$;
create or replace function public.research_library_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='research_dossiers' then
  if new.owner_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
 else
  if not public.research_can_edit(new.dossier_id) or not exists(select 1 from public.research_dossiers where id=new.dossier_id and owner_id=new.owner_id) then raise exception 'FORBIDDEN'; end if;
  new.created_by:=auth.uid();
  if new.revision_of is not null and not exists(select 1 from public.research_entries where id=new.revision_of and dossier_id=new.dossier_id) then raise exception 'FORBIDDEN'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,771));
 if tg_table_name='research_dossiers' then
  if (select count(*) from public.research_dossiers where owner_id=new.owner_id)>=100 then raise exception 'LIBRARY_LIMIT'; end if;
 else
  if (select count(*) from public.research_entries where owner_id=new.owner_id)>=1000 then raise exception 'LIBRARY_LIMIT'; end if;
 end if;
 return new;
end $$;
create or replace function public.research_append(p_dossier uuid,p_id uuid,p_title text,p_body text,p_sources jsonb,p_revision uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner_user uuid;
begin
 select owner_id into owner_user from public.research_dossiers where id=p_dossier for update;
 if not found or not public.research_can_edit(p_dossier) then raise exception 'FORBIDDEN'; end if;
 insert into public.research_entries(id,owner_id,dossier_id,title,body,sources,revision_of) values(p_id,owner_user,p_dossier,p_title,p_body,p_sources,p_revision);
end $$;
revoke all on function public.research_can_edit(uuid),public.research_editable_dossiers(),public.research_append(uuid,uuid,text,text,jsonb,uuid),public.research_share(uuid,uuid,uuid,boolean,text),public.research_access_state(uuid) from public,anon;
grant execute on function public.research_can_edit(uuid),public.research_editable_dossiers(),public.research_append(uuid,uuid,text,text,jsonb,uuid),public.research_share(uuid,uuid,uuid,boolean,text),public.research_access_state(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
