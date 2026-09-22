-- User authorised EUR 10 TOTAL on 2026-09-22. Preserve every previous reserve.
-- This does not enable customer billing or renew the pilot expiry.
begin;
alter table public.ai_pilot_budget add column if not exists limit_cents integer not null default 500 check(limit_cents between 0 and 1000);
alter table public.ai_pilot_budget drop constraint if exists ai_pilot_budget_reserved_cents_check;
alter table public.ai_pilot_budget add constraint ai_pilot_budget_reserved_cents_check check(reserved_cents between 0 and 1000 and reserved_cents<=limit_cents);
update public.ai_pilot_budget set limit_cents=1000 where singleton=true;
alter table public.ai_pilot_attempts drop constraint if exists ai_pilot_attempts_kind_check;
alter table public.ai_pilot_attempts add constraint ai_pilot_attempts_kind_check check(kind in ('research','research-advanced','document','analysis','transcription'));
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
 amount := case p_kind when 'research' then 150 when 'research-advanced' then 450 when 'document' then 60 when 'analysis' then 130 when 'transcription' then 20 else null end;
 if amount is null or p_id is null then raise exception 'PILOT_FORBIDDEN'; end if;
 if budget.reserved_cents+amount>least(budget.limit_cents,1000) then raise exception 'PILOT_EXHAUSTED'; end if;
 insert into public.ai_pilot_attempts(id,kind,reserved_cents) values(p_id,p_kind,amount);
 update public.ai_pilot_budget set reserved_cents=reserved_cents+amount where singleton=true;
 return true;
end $$;
revoke all on function public.ai_pilot_reserve(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_pilot_reserve(uuid,uuid,text) to service_role;
commit;
