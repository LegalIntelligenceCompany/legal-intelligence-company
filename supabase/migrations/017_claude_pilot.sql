-- One Claude Sonnet attempt, EUR 1 reserved inside the existing EUR 10 pilot.
-- Never replenishes budget, never enables commercial usage or permits a retry.
begin;
create table if not exists public.ai_claude_pilot (
 singleton boolean primary key default true check(singleton),
 owner_id uuid not null references auth.users(id),
 reserved_cents integer not null default 100 check(reserved_cents=100),
 status text not null default 'reserved' check(status in ('reserved','completed','uncertain')),
 result jsonb,
 created_at timestamptz not null default now()
);
alter table public.ai_claude_pilot enable row level security;
revoke all on public.ai_claude_pilot from public,anon,authenticated;
grant select,update on public.ai_claude_pilot to service_role;
create or replace function public.ai_claude_pilot_reserve(p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare budget public.ai_pilot_budget;
begin
 select * into budget from public.ai_pilot_budget where singleton=true for update;
 if not found then raise exception 'PILOT_SETUP'; end if;
 if p_actor is null or p_actor<>budget.owner_id or not exists(
  select 1 from auth.users where id=p_actor and lower(email)='legalintelligencecompany@gmail.com' and email_confirmed_at is not null
 ) then raise exception 'PILOT_FORBIDDEN'; end if;
 if now()>budget.expires_at or now()>'2026-09-29 23:59:59+00'::timestamptz then raise exception 'PILOT_EXPIRED'; end if;
 if exists(select 1 from public.ai_claude_pilot) then raise exception 'PILOT_DUPLICATE'; end if;
 if budget.reserved_cents+100>least(budget.limit_cents,1000) then raise exception 'PILOT_EXHAUSTED'; end if;
 insert into public.ai_claude_pilot(owner_id) values(p_actor);
 update public.ai_pilot_budget set reserved_cents=reserved_cents+100 where singleton=true;
 return true;
end $$;
revoke all on function public.ai_claude_pilot_reserve(uuid) from public,anon,authenticated;
grant execute on function public.ai_claude_pilot_reserve(uuid) to service_role;
commit;
