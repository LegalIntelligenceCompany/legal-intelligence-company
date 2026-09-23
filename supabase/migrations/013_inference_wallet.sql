-- Commercial inference ledger. Deliberately separate from prepaid_test_*.
-- This migration creates NO money, paid subscription or permission to run AI.
begin;
alter table public.research_jobs add column if not exists funding_mode text not null default 'pilot' check(funding_mode in ('pilot','commercial'));
create table if not exists public.ai_credit_wallets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 organization_id uuid references public.organizations(id),
 balance_cents bigint not null default 0 check(balance_cents between 0 and 100000000),
 reserved_cents bigint not null default 0 check(reserved_cents between 0 and balance_cents),
 live_customer text unique, live_subscription text unique,
 active_until timestamptz, frozen boolean not null default false
);
create unique index if not exists ai_credit_personal on public.ai_credit_wallets(owner_id) where organization_id is null;
create unique index if not exists ai_credit_company on public.ai_credit_wallets(organization_id) where organization_id is not null;
create table if not exists public.ai_credit_seats (
 wallet_id uuid references public.ai_credit_wallets(id), user_id uuid references auth.users(id), primary key(wallet_id,user_id)
);
create table if not exists public.ai_meter_requests (
 id uuid primary key, actor_id uuid not null references auth.users(id), wallet_id uuid not null references public.ai_credit_wallets(id),
 ceiling_cents integer not null check(ceiling_cents between 1 and 50000),
 plan jsonb not null check(jsonb_typeof(plan)='array' and jsonb_array_length(plan) between 1 and 5),
 exchange jsonb not null, state text not null default 'reserved' check(state in ('reserved','settled')),
 actual_cents integer, created_at timestamptz not null default now(),
 check((state='reserved' and actual_cents is null) or (state='settled' and actual_cents between 0 and ceiling_cents))
);
create table if not exists public.ai_meter_receipts (
 request_id uuid references public.ai_meter_requests(id), stage integer not null check(stage between 0 and 4),
 response_id text not null unique check(response_id ~ '^resp_[A-Za-z0-9_-]+$'),
 usage jsonb not null, cost_nano_usd numeric(30,0) not null check(cost_nano_usd>=0),
 primary key(request_id,stage)
);
create table if not exists public.ai_credit_movements (
 id bigint generated always as identity primary key, wallet_id uuid not null references public.ai_credit_wallets(id),
 source text not null unique, delta_cents bigint not null, created_at timestamptz not null default now()
);
create or replace function public.ai_meter_wallets(p_actor uuid) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'scope',case when w.organization_id is null then 'personal' else 'company' end,
 'balanceCents',w.balance_cents,'reservedCents',w.reserved_cents,'availableCents',w.balance_cents-w.reserved_cents,
 'active',coalesce(w.active_until>now(),false),'frozen',w.frozen)), '[]'::jsonb)
 from public.ai_credit_wallets w where exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 and ((w.organization_id is null and w.owner_id=p_actor) or (w.organization_id is not null
 and exists(select 1 from public.ai_credit_seats where wallet_id=w.id and user_id=p_actor)
 and exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor)));
$$;
create or replace function public.ai_meter_reserve(p_actor uuid,p_wallet uuid,p_id uuid,p_ceiling integer,p_plan jsonb,p_exchange jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare w public.ai_credit_wallets;
begin
 if p_actor is null or p_id is null or p_ceiling is null or p_ceiling not between 1 and 50000 or p_plan is null or p_exchange is null then raise exception 'METER_INVALID'; end if;
 select * into w from public.ai_credit_wallets where id=p_wallet for update;
 if not found or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'METER_FORBIDDEN'; end if;
 if w.organization_id is null then
  if w.owner_id<>p_actor then raise exception 'METER_FORBIDDEN'; end if;
 else
  if not exists(select 1 from public.ai_credit_seats where wallet_id=p_wallet and user_id=p_actor)
   or (select count(*) from public.ai_credit_seats where wallet_id=p_wallet)>3
   or not exists(select 1 from public.organization_members where organization_id=w.organization_id and user_id=p_actor)
   then raise exception 'METER_FORBIDDEN'; end if;
 end if;
 if w.frozen then raise exception 'METER_FROZEN'; end if;
 if w.live_customer is null or w.live_subscription is null or w.active_until is null or w.active_until<=now() then raise exception 'METER_SUBSCRIPTION'; end if;
 if exists(select 1 from public.ai_meter_requests where id=p_id) then raise exception 'METER_DUPLICATE'; end if;
 if w.balance_cents-w.reserved_cents<p_ceiling then raise exception 'METER_BALANCE'; end if;
 insert into public.ai_meter_requests(id,actor_id,wallet_id,ceiling_cents,plan,exchange) values(p_id,p_actor,p_wallet,p_ceiling,p_plan,p_exchange);
 update public.ai_credit_wallets set reserved_cents=reserved_cents+p_ceiling where id=p_wallet;
 return true;
end $$;
create or replace function public.ai_meter_record(p_actor uuid,p_id uuid,p_stage integer,p_usage jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ai_meter_requests; old public.ai_meter_receipts; s jsonb; t jsonb; amount numeric;
 i bigint; c bigint; o bigint; searches bigint;
begin
 select * into r from public.ai_meter_requests where id=p_id for update;
 if not found or r.actor_id is distinct from p_actor then raise exception 'METER_FORBIDDEN'; end if;
 if p_stage is null or p_stage<0 or p_stage>=jsonb_array_length(r.plan) or p_usage is null then raise exception 'METER_INVALID'; end if;
 select * into old from public.ai_meter_receipts where request_id=p_id and stage=p_stage;
 if found then
  if old.usage is distinct from p_usage then raise exception 'METER_CONFLICT'; end if;
  return true;
 end if;
 if r.state<>'reserved' then raise exception 'METER_CONFLICT'; end if;
 s:=r.plan->p_stage; t:=s->'tariff';
 if p_usage->>'model' is distinct from t->>'model' or p_usage->>'tier' is distinct from t->>'tier' then raise exception 'METER_TARIFF'; end if;
 -- Only server-normalised usage is accepted. No user-visible answer is stored.
 i:=(p_usage->>'input')::bigint; c:=(p_usage->>'cachedInput')::bigint;
 o:=(p_usage->>'output')::bigint; searches:=(p_usage->>'webSearchCalls')::bigint;
 if i is null or c is null or o is null or searches is null or i<0 or c<0 or c>i or o<0 or searches<0
  or i>(s->>'maxInput')::bigint or o>(s->>'maxOutput')::bigint or searches>(s->>'maxWebSearchCalls')::bigint then raise exception 'METER_CEILING'; end if;
 amount:=(i-c)::numeric*(t->>'inputNanoUsd')::numeric+c::numeric*(t->>'cachedInputNanoUsd')::numeric
  +o::numeric*(t->>'outputNanoUsd')::numeric+searches::numeric*(t->>'webSearchNanoUsd')::numeric;
 insert into public.ai_meter_receipts(request_id,stage,response_id,usage,cost_nano_usd)
 values(p_id,p_stage,p_usage->>'responseId',p_usage,amount);
 return true;
end $$;
create or replace function public.ai_meter_settle(p_actor uuid,p_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.ai_meter_requests; amount numeric; charge integer; count_receipts integer;
begin
 select * into r from public.ai_meter_requests where id=p_id;
 if not found or r.actor_id is distinct from p_actor then raise exception 'METER_FORBIDDEN'; end if;
 -- Lock in wallet -> request order, the same order as reserve.
 perform 1 from public.ai_credit_wallets where id=r.wallet_id for update;
 select * into r from public.ai_meter_requests where id=p_id for update;
 if r.state='settled' then return r.actual_cents; end if;
 select count(*),sum(cost_nano_usd) into count_receipts,amount from public.ai_meter_receipts where request_id=p_id;
 if count_receipts<>jsonb_array_length(r.plan) then raise exception 'METER_UNCONFIRMED'; end if;
 if (r.exchange->>'usdDenominator')::numeric<=0 or (r.exchange->>'eurNumerator')::numeric<=0 then raise exception 'METER_INVALID'; end if;
 charge:=ceil(amount*(r.exchange->>'eurNumerator')::numeric*3/((r.exchange->>'usdDenominator')::numeric*10000000))::integer;
 if charge is null or charge<0 or charge>r.ceiling_cents then raise exception 'METER_CEILING'; end if;
 update public.ai_credit_wallets set reserved_cents=reserved_cents-r.ceiling_cents,balance_cents=balance_cents-charge where id=r.wallet_id;
 insert into public.ai_credit_movements(wallet_id,source,delta_cents) values(r.wallet_id,'usage:'||p_id,-charge);
 update public.ai_meter_requests set state='settled',actual_cents=charge where id=p_id;
 return charge;
end $$;
-- No timeout-based release: absent usage does not mean free provider work.
do $$ declare t text; f record; begin
 foreach t in array array['ai_credit_wallets','ai_credit_seats','ai_meter_requests','ai_meter_receipts','ai_credit_movements'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ai_meter_reserve','ai_meter_record','ai_meter_settle','ai_meter_wallets') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
