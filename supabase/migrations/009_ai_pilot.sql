-- One lifetime pilot, EUR 5 total conservative reservations. Re-running never
-- resets the balance, owner, expiry or existing attempts. No client access.
begin;
create table if not exists public.ai_pilot_budget (
 singleton boolean primary key default true check (singleton),
 owner_id uuid not null references auth.users(id),
 reserved_cents integer not null default 0 check (reserved_cents between 0 and 500),
 expires_at timestamptz not null default '2026-09-29 23:59:59+00'
);
create table if not exists public.ai_pilot_attempts (
 id uuid primary key,
 kind text not null check (kind in ('research','document','analysis','transcription')),
 reserved_cents integer not null check (reserved_cents > 0),
 created_at timestamptz not null default now()
);
alter table public.ai_pilot_budget enable row level security;
alter table public.ai_pilot_attempts enable row level security;
revoke all on public.ai_pilot_budget, public.ai_pilot_attempts from public, anon, authenticated;
grant select on public.ai_pilot_budget to service_role;
do $$
declare actor uuid;
begin
 if not exists(select 1 from public.ai_pilot_budget) then
  select id into strict actor from auth.users
   where lower(email)='legalintelligencecompany@gmail.com' and email_confirmed_at is not null;
  insert into public.ai_pilot_budget(owner_id) values(actor);
 end if;
end $$;
create or replace function public.ai_pilot_reserve(p_actor uuid,p_id uuid,p_kind text)
returns boolean language plpgsql security definer set search_path='' as $$
declare budget public.ai_pilot_budget; amount integer;
begin
 select * into budget from public.ai_pilot_budget where singleton=true for update;
 if not found then raise exception 'PILOT_SETUP'; end if;
 if p_actor is null or p_actor<>budget.owner_id or not exists(
  select 1 from auth.users where id=p_actor and lower(email)='legalintelligencecompany@gmail.com' and email_confirmed_at is not null
 ) then raise exception 'PILOT_FORBIDDEN'; end if;
 if now()>budget.expires_at or now()>'2026-09-29 23:59:59+00'::timestamptz then raise exception 'PILOT_EXPIRED'; end if;
 if exists(select 1 from public.ai_pilot_attempts where id=p_id) then raise exception 'PILOT_DUPLICATE'; end if;
 amount := case p_kind when 'research' then 150 when 'document' then 60 when 'analysis' then 130 when 'transcription' then 20 else null end;
 if amount is null or p_id is null then raise exception 'PILOT_FORBIDDEN'; end if;
 if budget.reserved_cents+amount>500 then raise exception 'PILOT_EXHAUSTED'; end if;
 insert into public.ai_pilot_attempts(id,kind,reserved_cents) values(p_id,p_kind,amount);
 update public.ai_pilot_budget set reserved_cents=reserved_cents+amount where singleton=true;
 return true;
end $$;
revoke all on function public.ai_pilot_reserve(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_pilot_reserve(uuid,uuid,text) to service_role;
commit;
