-- Billing sandbox only. No production entitlements or real AI calls.
-- Independent of 005; requires the Supabase auth schema.
begin;
create table if not exists public.billing_test_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text unique check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
  checkout_key uuid not null default gen_random_uuid(),
  checkout_id text,
  lock_token uuid,
  lock_until timestamptz,
  synced_at timestamptz
);
create table if not exists public.billing_test_subscriptions (
  id text primary key check(id ~ '^sub_[A-Za-z0-9]+$'),
  user_id uuid not null references public.billing_test_accounts(user_id) on delete cascade,
  price_id text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cancel_at_period_end boolean not null,
  paid boolean not null,
  plan_key text not null check(plan_key='sandbox'),
  updated_at timestamptz not null default now()
);
create table if not exists public.billing_test_events (
  id text primary key,
  processed_at timestamptz not null default now()
);
create table if not exists public.billing_test_usage (
  id uuid primary key,
  user_id uuid not null references public.billing_test_accounts(user_id) on delete cascade,
  kind text not null check(kind in ('assistant','analysis')),
  created_at timestamptz not null default now()
);
create index if not exists billing_test_usage_user_date on public.billing_test_usage(user_id,created_at);
create index if not exists billing_test_subscriptions_user on public.billing_test_subscriptions(user_id);
alter table public.billing_test_accounts enable row level security;
alter table public.billing_test_subscriptions enable row level security;
alter table public.billing_test_events enable row level security;
alter table public.billing_test_usage enable row level security;
revoke all on public.billing_test_accounts,public.billing_test_subscriptions,public.billing_test_events,public.billing_test_usage from public,anon,authenticated;
grant select,insert,update,delete on public.billing_test_accounts,public.billing_test_subscriptions,public.billing_test_events,public.billing_test_usage to service_role;

-- Fenced lease covers remote Stripe calls. A stale worker cannot commit over a newer one.
create or replace function public.billing_test_lock(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.billing_test_accounts; t uuid := gen_random_uuid();
begin
  insert into public.billing_test_accounts(user_id) values(p_actor) on conflict do nothing;
  select * into a from public.billing_test_accounts where user_id=p_actor for update;
  if a.lock_until>now() then raise exception 'BUSY'; end if;
  update public.billing_test_accounts set lock_token=t,lock_until=now()+interval '90 seconds' where user_id=p_actor;
  return to_jsonb(a) || jsonb_build_object('lock_token',t);
end $$;
create or replace function public.billing_test_unlock(p_actor uuid,p_token uuid) returns void
language sql security definer set search_path='' as $$
  update public.billing_test_accounts set lock_token=null,lock_until=null where user_id=p_actor and lock_token=p_token;
$$;
create or replace function public.billing_test_bind(p_actor uuid,p_token uuid,p_customer text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.billing_test_accounts;
begin
  select * into a from public.billing_test_accounts where user_id=p_actor for update;
  if not found or p_token is null or a.lock_until is null or a.lock_token is distinct from p_token or a.lock_until<=now() then raise exception 'BUSY'; end if;
  if a.customer_id is not null and a.customer_id<>p_customer then raise exception 'CUSTOMER_CONFLICT'; end if;
  update public.billing_test_accounts set customer_id=p_customer where user_id=p_actor;
end $$;
create or replace function public.billing_test_checkout(p_actor uuid,p_token uuid,p_session text,p_rotate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.billing_test_accounts; k uuid;
begin
  select * into a from public.billing_test_accounts where user_id=p_actor for update;
  if not found or p_token is null or a.lock_until is null or a.lock_token is distinct from p_token or a.lock_until<=now() then raise exception 'BUSY'; end if;
  if p_session is not null and p_session !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'INVALID'; end if;
  k:=case when p_rotate then gen_random_uuid() else a.checkout_key end;
  update public.billing_test_accounts set checkout_key=k,checkout_id=p_session where user_id=p_actor;
  return k;
end $$;
create or replace function public.billing_test_sync(p_actor uuid,p_token uuid,p_rows jsonb,p_event text default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.billing_test_accounts; s jsonb;
begin
  select * into a from public.billing_test_accounts where user_id=p_actor for update;
  if not found or p_token is null or a.lock_until is null or a.lock_token is distinct from p_token or a.lock_until<=now() then raise exception 'BUSY'; end if;
  if p_event is not null and exists(select 1 from public.billing_test_events where id=p_event) then return; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise exception 'INVALID'; end if;
  -- Replace a complete Stripe snapshot atomically. No reliance on webhook delivery order.
  delete from public.billing_test_subscriptions where user_id=p_actor;
  for s in select value from jsonb_array_elements(p_rows) loop
    insert into public.billing_test_subscriptions(id,user_id,price_id,status,period_start,period_end,cancel_at_period_end,paid,plan_key)
    values(s->>'id',p_actor,s->>'price_id',s->>'status',(s->>'period_start')::timestamptz,(s->>'period_end')::timestamptz,(s->>'cancel_at_period_end')::boolean,(s->>'paid')::boolean,'sandbox');
  end loop;
  update public.billing_test_accounts set synced_at=now() where user_id=p_actor;
  if p_event is not null then insert into public.billing_test_events(id) values(p_event) on conflict do nothing; end if;
end $$;
create or replace function public.billing_test_use(p_actor uuid,p_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.billing_test_subscriptions; a public.billing_test_accounts; used integer; maximum integer;
begin
  if p_kind not in ('assistant','analysis') or p_kind is null or p_id is null then raise exception 'INVALID'; end if;
  select * into a from public.billing_test_accounts where user_id=p_actor for update;
  if not found or a.synced_at is null or a.synced_at<now()-interval '5 minutes' then raise exception 'SYNC_REQUIRED'; end if;
  if exists(select 1 from public.billing_test_usage where id=p_id) then
    if exists(select 1 from public.billing_test_usage where id=p_id and user_id=p_actor and kind=p_kind) then return jsonb_build_object('duplicate',true); end if;
    raise exception 'FORBIDDEN';
  end if;
  select * into s from public.billing_test_subscriptions where user_id=p_actor and status='active' and paid and period_start<=now() and period_end>now() order by period_end desc limit 1;
  if not found then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
  maximum:=case when p_kind='assistant' then 20 else 5 end;
  select count(*) into used from public.billing_test_usage where user_id=p_actor and kind=p_kind and created_at>=s.period_start;
  if used>=maximum then raise exception 'QUOTA_EXCEEDED'; end if;
  insert into public.billing_test_usage(id,user_id,kind) values(p_id,p_actor,p_kind);
  return jsonb_build_object('duplicate',false,'used',used+1,'limit',maximum);
end $$;
revoke all on function public.billing_test_lock(uuid),public.billing_test_unlock(uuid,uuid),public.billing_test_bind(uuid,uuid,text),public.billing_test_checkout(uuid,uuid,text,boolean),public.billing_test_sync(uuid,uuid,jsonb,text),public.billing_test_use(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.billing_test_lock(uuid),public.billing_test_unlock(uuid,uuid),public.billing_test_bind(uuid,uuid,text),public.billing_test_checkout(uuid,uuid,text,boolean),public.billing_test_sync(uuid,uuid,jsonb,text),public.billing_test_use(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
