-- Isolated sandbox wallet. Never grants permission to invoke a paid provider.
begin;
create table if not exists public.prepaid_test_wallets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 organization_id uuid references public.organizations(id),
 plan text not null check(plan in ('individual','business')),
 balance_cents bigint not null default 0 check(balance_cents between 0 and 100000000),
 reserved_cents bigint not null default 0 check(reserved_cents between 0 and balance_cents),
 active_until timestamptz,
 synced_at timestamptz,
 frozen boolean not null default false,
 check ((plan='individual' and organization_id is null) or (plan='business' and organization_id is not null))
);
create unique index if not exists prepaid_test_personal on public.prepaid_test_wallets(owner_id) where organization_id is null;
create unique index if not exists prepaid_test_company on public.prepaid_test_wallets(organization_id) where organization_id is not null;
create table if not exists public.prepaid_test_seats (
 wallet_id uuid references public.prepaid_test_wallets(id), user_id uuid references auth.users(id),
 primary key(wallet_id,user_id)
);
create table if not exists public.prepaid_test_orders (
 id uuid primary key, wallet_id uuid not null references public.prepaid_test_wallets(id),
 kind text not null check(kind in ('access','credits')), amount_cents integer not null check(amount_cents between 100 and 50000),
 customer_id text not null check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
 session_id text unique check(session_id ~ '^cs_test_[A-Za-z0-9]+$'),
 payment_intent text unique, credited boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.prepaid_test_reservations (
 id uuid primary key, wallet_id uuid not null references public.prepaid_test_wallets(id), actor uuid not null references auth.users(id),
 ceiling_cents integer not null check(ceiling_cents between 1 and 50000),
 state text not null default 'reserved' check(state in ('reserved','settled')),
 actual_cents integer check(actual_cents>=0 and actual_cents<=ceiling_cents),
 cost_micros bigint check(cost_micros>=0), created_at timestamptz not null default now(),
 check ((state='reserved' and actual_cents is null and cost_micros is null) or (state='settled' and actual_cents is not null and cost_micros is not null))
);
create table if not exists public.prepaid_test_ledger (
 id bigint generated always as identity primary key, wallet_id uuid not null references public.prepaid_test_wallets(id),
 source text not null unique, delta_cents bigint not null, created_at timestamptz not null default now()
);

create or replace function public.prepaid_test_open(p_actor uuid,p_plan text,p_org uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare w public.prepaid_test_wallets;
begin
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'FORBIDDEN'; end if;
 if p_plan is null or p_plan not in ('individual','business') or (p_plan='individual' and p_org is not null) or (p_plan='business' and p_org is null) then raise exception 'INVALID'; end if;
 if p_org is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role='owner') then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_org,p_actor)::text,12));
 select * into w from public.prepaid_test_wallets where (p_org is null and owner_id=p_actor and organization_id is null) or (p_org is not null and organization_id=p_org) for update;
 if found then
  if w.owner_id<>p_actor or w.plan<>p_plan then raise exception 'FORBIDDEN'; end if;
  return w.id;
 end if;
 insert into public.prepaid_test_wallets(owner_id,organization_id,plan) values(p_actor,p_org,p_plan) returning * into w;
 insert into public.prepaid_test_seats values(w.id,p_actor);
 return w.id;
end $$;
create or replace function public.prepaid_test_member(p_actor uuid,p_wallet uuid,p_member uuid,p_add boolean) returns void
language plpgsql security definer set search_path='' as $$
declare w public.prepaid_test_wallets;
begin
 select * into w from public.prepaid_test_wallets where id=p_wallet for update;
 if not found or w.owner_id is distinct from p_actor or w.plan<>'business' or p_member is null or p_member=w.owner_id or p_add is null then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor and role='owner') then raise exception 'FORBIDDEN'; end if;
 if p_add then
  if not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=w.organization_id and m.user_id=p_member and u.email_confirmed_at is not null) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.prepaid_test_seats where wallet_id=p_wallet and user_id=p_member) then return; end if;
  if (select count(*) from public.prepaid_test_seats where wallet_id=p_wallet)>=3 then raise exception 'SEAT_LIMIT'; end if;
  insert into public.prepaid_test_seats values(p_wallet,p_member);
 else delete from public.prepaid_test_seats where wallet_id=p_wallet and user_id=p_member;
 end if;
end $$;
create or replace function public.prepaid_test_order(p_actor uuid,p_wallet uuid,p_id uuid,p_kind text,p_amount integer,p_customer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.prepaid_test_wallets; o public.prepaid_test_orders;
begin
 select * into w from public.prepaid_test_wallets where id=p_wallet for update;
 if not found or w.owner_id is distinct from p_actor or w.frozen then raise exception 'FORBIDDEN'; end if;
 if w.organization_id is not null and not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor and role='owner') then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_kind is null or p_kind not in ('access','credits') or p_amount is null or p_amount not between 100 and 50000 or p_customer is null then raise exception 'INVALID'; end if;
 if p_kind='access' and p_amount<>(case when w.plan='individual' then 4900 else 9900 end) then raise exception 'INVALID'; end if;
 if p_kind='credits' and (w.active_until is null or w.active_until<=now() or w.synced_at is null or w.synced_at<now()-interval '5 minutes') then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
 select * into o from public.prepaid_test_orders where id=p_id;
 if found then
  if o.wallet_id<>p_wallet or o.kind<>p_kind or o.amount_cents<>p_amount or o.customer_id<>p_customer then raise exception 'CONFLICT'; end if;
  return to_jsonb(o);
 end if;
 insert into public.prepaid_test_orders(id,wallet_id,kind,amount_cents,customer_id) values(p_id,p_wallet,p_kind,p_amount,p_customer) returning * into o;
 return to_jsonb(o);
end $$;
create or replace function public.prepaid_test_bind(p_id uuid,p_session text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.prepaid_test_orders;
begin
 select * into o from public.prepaid_test_orders where id=p_id for update;
 if not found or p_session is null then raise exception 'INVALID'; end if;
 if o.session_id is not null and o.session_id<>p_session then raise exception 'CONFLICT'; end if;
 update public.prepaid_test_orders set session_id=p_session where id=p_id;
end $$;
-- Called only after a fresh complete Stripe subscription snapshot, under the
-- existing fenced billing lease. Monthly renewal NEVER adds consumption credit.
create or replace function public.prepaid_test_access(p_actor uuid,p_wallet uuid,p_token uuid,p_until timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billing_test_accounts where user_id=p_actor and lock_token=p_token and lock_until>now()) then raise exception 'BUSY'; end if;
 update public.prepaid_test_wallets set active_until=p_until,synced_at=now() where id=p_wallet and owner_id=p_actor;
 if not found then raise exception 'FORBIDDEN'; end if;
end $$;
-- Full transaction includes the order, ledger and balance. Replayed or distinct
-- webhook events for the same payment cannot credit twice.
create or replace function public.prepaid_test_credit(p_id uuid,p_session text,p_customer text,p_pi text,p_amount integer,p_blocked boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare o public.prepaid_test_orders; w public.prepaid_test_wallets;
begin
 select * into o from public.prepaid_test_orders where id=p_id;
 if not found then raise exception 'INVALID'; end if;
 select * into w from public.prepaid_test_wallets where id=o.wallet_id for update;
 select * into o from public.prepaid_test_orders where id=p_id for update;
 if o.kind<>'credits' or o.session_id is distinct from p_session or o.customer_id is distinct from p_customer or o.amount_cents is distinct from p_amount or p_pi is null or p_pi !~ '^pi_[A-Za-z0-9]+$' then raise exception 'CONFLICT'; end if;
 if p_blocked is null then raise exception 'INVALID'; end if;
 if p_blocked then update public.prepaid_test_wallets set frozen=true where id=w.id; end if;
 if o.credited then
  if o.payment_intent is distinct from p_pi then raise exception 'CONFLICT'; end if;
  return;
 end if;
 update public.prepaid_test_orders set credited=true,payment_intent=p_pi where id=p_id;
 insert into public.prepaid_test_ledger(wallet_id,source,delta_cents) values(w.id,'payment:'||p_pi,p_amount);
 update public.prepaid_test_wallets set balance_cents=balance_cents+p_amount where id=w.id;
end $$;
create or replace function public.prepaid_test_reserve(p_actor uuid,p_wallet uuid,p_id uuid,p_ceiling integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.prepaid_test_wallets;
begin
 if p_id is null or p_ceiling is null or p_ceiling not between 1 and 50000 then raise exception 'INVALID'; end if;
 select * into w from public.prepaid_test_wallets where id=p_wallet for update;
 if not found or not exists(select 1 from public.prepaid_test_seats s join auth.users u on u.id=s.user_id where s.wallet_id=p_wallet and s.user_id=p_actor and u.email_confirmed_at is not null) then raise exception 'FORBIDDEN'; end if;
 if w.organization_id is not null and not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor) then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from public.prepaid_test_reservations where id=p_id) then raise exception 'DUPLICATE'; end if;
 if w.frozen then raise exception 'FROZEN'; end if;
 if w.synced_at is null or w.synced_at<now()-interval '5 minutes' then raise exception 'SYNC_REQUIRED'; end if;
 if w.active_until is null or w.active_until<=now() then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
 if w.balance_cents-w.reserved_cents<p_ceiling then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.prepaid_test_reservations(id,wallet_id,actor,ceiling_cents) values(p_id,p_wallet,p_actor,p_ceiling);
 update public.prepaid_test_wallets set reserved_cents=reserved_cents+p_ceiling where id=p_wallet;
 return true;
end $$;
create or replace function public.prepaid_test_settle(p_id uuid,p_cost_micros bigint) returns integer
language plpgsql security definer set search_path='' as $$
declare r public.prepaid_test_reservations; charge integer;
begin
 if p_cost_micros is null or p_cost_micros<0 or p_cost_micros>166666666 then raise exception 'INVALID'; end if;
 select * into r from public.prepaid_test_reservations where id=p_id;
 if not found then raise exception 'INVALID'; end if;
 perform 1 from public.prepaid_test_wallets where id=r.wallet_id for update;
 select * into r from public.prepaid_test_reservations where id=p_id for update;
 charge:=((p_cost_micros*3+9999)/10000)::integer;
 if r.state='settled' then
  if r.cost_micros<>p_cost_micros then raise exception 'CONFLICT'; end if;
  return r.actual_cents;
 end if;
 if charge>r.ceiling_cents then raise exception 'CEILING_EXCEEDED'; end if;
 update public.prepaid_test_wallets set reserved_cents=reserved_cents-r.ceiling_cents,balance_cents=balance_cents-charge where id=r.wallet_id;
 update public.prepaid_test_reservations set state='settled',actual_cents=charge,cost_micros=p_cost_micros where id=p_id;
 insert into public.prepaid_test_ledger(wallet_id,source,delta_cents) values(r.wallet_id,'usage:'||p_id,-charge);
 return charge;
end $$;
-- Unknown provider outcomes keep their reservation. No expiry-based release.
-- Refund/dispute freezes all new spending; reconciliation cannot make it
-- available again merely because a later paid event is received.
create or replace function public.prepaid_test_freeze(p_pi text) returns void
language sql security definer set search_path='' as $$
 update public.prepaid_test_wallets set frozen=true where id in
 (select wallet_id from public.prepaid_test_orders where payment_intent=p_pi);
$$;
do $$ declare t text; f record; begin
 foreach t in array array['prepaid_test_wallets','prepaid_test_seats','prepaid_test_orders','prepaid_test_reservations','prepaid_test_ledger'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'prepaid_test_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
