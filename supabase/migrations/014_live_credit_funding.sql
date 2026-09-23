-- Live funding orders. No migration grants money or calls Stripe.
begin;
create table if not exists public.ai_credit_orders (
 id uuid primary key, wallet_id uuid not null references public.ai_credit_wallets(id),
 kind text not null check(kind in ('access','credits')), amount_cents integer not null check(amount_cents between 100 and 50000),
 session_id text unique check(session_id ~ '^cs_live_[A-Za-z0-9]+$'),
 payment_intent text unique, fulfilled boolean not null default false, closed boolean not null default false, created_at timestamptz not null default now()
);
create unique index if not exists ai_credit_one_access_order on public.ai_credit_orders(wallet_id) where kind='access' and not closed;
create or replace function public.ai_credit_open(p_actor uuid,p_org uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare w public.ai_credit_wallets;
begin
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'METER_FORBIDDEN'; end if;
 if p_org is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role='owner') then raise exception 'METER_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_org,p_actor)::text,14));
 select * into w from public.ai_credit_wallets where (p_org is null and owner_id=p_actor and organization_id is null) or (p_org is not null and organization_id=p_org);
 if found then if w.owner_id<>p_actor then raise exception 'METER_FORBIDDEN'; end if; return w.id; end if;
 insert into public.ai_credit_wallets(owner_id,organization_id) values(p_actor,p_org) returning * into w;
 insert into public.ai_credit_seats values(w.id,p_actor);
 return w.id;
end $$;
create or replace function public.ai_credit_member(p_actor uuid,p_wallet uuid,p_member uuid,p_add boolean) returns void
language plpgsql security definer set search_path='' as $$
declare w public.ai_credit_wallets;
begin
 select * into w from public.ai_credit_wallets where id=p_wallet for update;
 if not found or w.owner_id is distinct from p_actor or w.organization_id is null or p_member is null or p_member=w.owner_id or p_add is null
 or not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor and role='owner') then raise exception 'METER_FORBIDDEN'; end if;
 if p_add then
  if not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=w.organization_id and m.user_id=p_member and u.email_confirmed_at is not null) then raise exception 'METER_FORBIDDEN'; end if;
  if exists(select 1 from public.ai_credit_seats where wallet_id=p_wallet and user_id=p_member) then return; end if;
  if (select count(*) from public.ai_credit_seats where wallet_id=p_wallet)>=3 then raise exception 'SEAT_LIMIT'; end if;
  insert into public.ai_credit_seats values(p_wallet,p_member);
 else delete from public.ai_credit_seats where wallet_id=p_wallet and user_id=p_member; end if;
end $$;
create or replace function public.ai_credit_order(p_actor uuid,p_wallet uuid,p_id uuid,p_kind text,p_amount integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.ai_credit_wallets; o public.ai_credit_orders;
begin
 select * into w from public.ai_credit_wallets where id=p_wallet for update;
 if not found or w.owner_id is distinct from p_actor or w.frozen then raise exception 'METER_FORBIDDEN'; end if;
 if w.organization_id is not null and not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor and role='owner') then raise exception 'METER_FORBIDDEN'; end if;
 if p_id is null or p_kind is null or p_kind not in ('access','credits') or p_amount is null or p_amount not between 100 and 50000 then raise exception 'METER_INVALID'; end if;
 if p_kind='access' and p_amount<>(case when w.organization_id is null then 4900 else 9900 end) then raise exception 'METER_INVALID'; end if;
 if p_kind='credits' and (w.live_customer is null or w.active_until is null or w.active_until<=now()) then raise exception 'METER_SUBSCRIPTION'; end if;
 select * into o from public.ai_credit_orders where id=p_id;
 if found then
  if o.wallet_id<>p_wallet or o.kind<>p_kind or o.amount_cents<>p_amount then raise exception 'METER_CONFLICT'; end if; return to_jsonb(o);
 end if;
 if p_kind='access' and (w.live_subscription is not null or exists(select 1 from public.ai_credit_orders where wallet_id=p_wallet and kind='access' and not closed)) then raise exception 'ACCESS_EXISTS'; end if;
 insert into public.ai_credit_orders(id,wallet_id,kind,amount_cents) values(p_id,p_wallet,p_kind,p_amount) returning * into o;return to_jsonb(o);
end $$;
create or replace function public.ai_credit_bind(p_id uuid,p_session text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.ai_credit_orders;
begin
 select * into o from public.ai_credit_orders where id=p_id for update;
 if not found or p_session is null then raise exception 'METER_INVALID'; end if;
 if o.session_id is not null and o.session_id<>p_session then raise exception 'METER_CONFLICT'; end if;
 update public.ai_credit_orders set session_id=p_session where id=p_id;
end $$;
create or replace function public.ai_credit_fulfill(p_id uuid,p_session text,p_customer text,p_payment text,p_until timestamptz,p_blocked boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.ai_credit_orders; w public.ai_credit_wallets;
begin
 select * into o from public.ai_credit_orders where id=p_id;
 if not found then raise exception 'METER_INVALID'; end if;
 select * into w from public.ai_credit_wallets where id=o.wallet_id for update;
 select * into o from public.ai_credit_orders where id=p_id for update;
 if o.session_id is distinct from p_session or p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' or p_payment is null or p_blocked is null
 or (w.live_customer is not null and w.live_customer<>p_customer) then raise exception 'METER_CONFLICT'; end if;
 if p_blocked then update public.ai_credit_wallets set frozen=true where id=w.id; return false; end if;
 if o.fulfilled then
  if o.payment_intent is distinct from p_payment then raise exception 'METER_CONFLICT'; end if; return true;
 end if;
 if o.kind='access' then
  if p_payment !~ '^sub_[A-Za-z0-9]+$' or p_until is null or p_until<=now() or (w.live_subscription is not null and w.live_subscription<>p_payment) then raise exception 'METER_CONFLICT'; end if;
  update public.ai_credit_wallets set live_customer=p_customer,live_subscription=p_payment,active_until=p_until where id=w.id;
 else
  if p_payment !~ '^pi_[A-Za-z0-9]+$' or w.live_customer is distinct from p_customer then raise exception 'METER_CONFLICT'; end if;
  insert into public.ai_credit_movements(wallet_id,source,delta_cents) values(w.id,'payment:'||p_payment,o.amount_cents);
  update public.ai_credit_wallets set balance_cents=balance_cents+o.amount_cents where id=w.id;
 end if;
 update public.ai_credit_orders set fulfilled=true,payment_intent=p_payment where id=p_id;return true;
end $$;
alter table public.ai_credit_orders enable row level security;
-- Only the server calls this after freshly verifying Stripe status=canceled.
-- Keep customer and credit balance; never grant money when replacing access.
create or replace function public.ai_credit_close_access(p_actor uuid,p_wallet uuid,p_subscription text) returns void
language plpgsql security definer set search_path='' as $$
declare w public.ai_credit_wallets;
begin
 select * into w from public.ai_credit_wallets where id=p_wallet for update;
 if not found or w.owner_id is distinct from p_actor or w.frozen or w.live_subscription is distinct from p_subscription or p_subscription is null then raise exception 'METER_FORBIDDEN'; end if;
 if w.organization_id is not null and not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor and role='owner') then raise exception 'METER_FORBIDDEN'; end if;
 update public.ai_credit_orders set closed=true where wallet_id=p_wallet and kind='access';
 update public.ai_credit_wallets set live_subscription=null,active_until=null where id=p_wallet;
end $$;
revoke all on public.ai_credit_orders from public,anon,authenticated;
grant select,insert,update on public.ai_credit_orders to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ai_credit_open','ai_credit_member','ai_credit_order','ai_credit_bind','ai_credit_fulfill','ai_credit_close_access') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
