-- Executar uma vez, depois de 001_initial_schema.sql, no SQL Editor.
begin;

-- Os membros só podem consultar a sua própria associação directamente.
create policy "read own membership" on public.organization_members
for select to authenticated using (user_id = (select auth.uid()));

-- Corrige a referência à organização nas políticas iniciais.
drop policy "members access policies" on public.policies;
create policy "members access policies" on public.policies for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = policies.organization_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.organization_members m where m.organization_id = policies.organization_id and m.user_id = auth.uid()));
drop policy "members access contracts" on public.contracts;
create policy "members access contracts" on public.contracts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = contracts.organization_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.organization_members m where m.organization_id = contracts.organization_id and m.user_id = auth.uid()));

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from anon, authenticated;

create function public.team_state() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.name, 'role', mine.role,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'role', m.role) order by u.email), '[]'::jsonb)
      from public.organization_members m join auth.users u on u.id = m.user_id where m.organization_id = o.id),
    'invitations', case when mine.role in ('owner','admin') then
      (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'expires_at', i.expires_at) order by i.expires_at desc), '[]'::jsonb)
       from public.team_invitations i where i.organization_id=o.id and i.accepted_at is null and i.revoked_at is null and i.expires_at>now())
      else '[]'::jsonb end
  ) order by o.name) from public.organizations o join public.organization_members mine on mine.organization_id=o.id where mine.user_id=auth.uid()), '[]'::jsonb);
end $$;

create function public.team_create_organization(company_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if company_name is null or length(trim(company_name)) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  -- Uma criação por conta neste MVP; as outras empresas podem convidá-la.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists(select 1 from public.organization_members where user_id=auth.uid() and role='owner') then raise exception 'ALREADY_OWNER'; end if;
  insert into public.organizations(name) values(trim(company_name)) returning id into result;
  insert into public.organization_members values(result, auth.uid(), 'owner');
  return result;
end $$;

create function public.team_invite(org_id uuid, invite_email text, invite_role text) returns text language plpgsql security definer set search_path = '' as $$
declare token text; normalized text := lower(trim(invite_email));
begin
  if not exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
  if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or invite_role is null or invite_role not in ('admin','member') then raise exception 'INVALID_INVITE'; end if;
  if invite_role='admin' and not exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and role='owner') then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text, 0));
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=org_id and lower(u.email)=normalized) then raise exception 'ALREADY_MEMBER'; end if;
  if exists(select 1 from public.team_invitations where organization_id=org_id and email=normalized and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'INVITE_EXISTS'; end if;
  if (select count(*) from public.team_invitations where organization_id=org_id and accepted_at is null and revoked_at is null and expires_at>now())>=50 then raise exception 'INVITE_LIMIT'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.team_invitations(organization_id,email,role,token_hash,created_by)
  values(org_id,normalized,invite_role,sha256(convert_to(token,'UTF8')),auth.uid());
  return token;
end $$;

create function public.team_accept(invite_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.team_invitations; verified_email text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.team_invitations where token_hash=sha256(convert_to(invite_token,'UTF8')) for update;
  if not found or verified_email is null or verified_email<>invitation.email or invitation.expires_at<=now() or invitation.accepted_at is not null or invitation.revoked_at is not null then raise exception 'INVALID_OR_EXPIRED_INVITE'; end if;
  insert into public.organization_members values(invitation.organization_id,auth.uid(),invitation.role) on conflict do nothing;
  update public.team_invitations set accepted_at=now() where id=invitation.id;
  return invitation.organization_id;
end $$;

create function public.team_revoke(invitation_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.team_invitations i set revoked_at=now()
  where i.id=invitation_id and i.accepted_at is null and exists(select 1 from public.organization_members m where m.organization_id=i.organization_id and m.user_id=auth.uid() and (m.role='owner' or (m.role='admin' and i.role='member')));
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;

-- Nenhuma destas funções pode ser invocada por visitantes anónimos.
revoke all on function public.team_state(), public.team_create_organization(text), public.team_invite(uuid,text,text), public.team_accept(text), public.team_revoke(uuid) from public, anon;
grant execute on function public.team_state(), public.team_create_organization(text), public.team_invite(uuid,text,text), public.team_accept(text), public.team_revoke(uuid) to authenticated;
commit;
