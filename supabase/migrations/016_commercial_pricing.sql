-- Versioned pricing. Existing and legacy-server requests retain their 3x price.
-- No payments, provider calls, balance grants or feature activation.
begin;
alter table public.ai_meter_requests add column if not exists markup_numerator integer not null default 3;
alter table public.ai_meter_requests add column if not exists markup_denominator integer not null default 1;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.ai_meter_requests'::regclass and conname='ai_meter_markup_valid') then
  alter table public.ai_meter_requests add constraint ai_meter_markup_valid check
   ((markup_numerator=3 and markup_denominator=1) or (markup_numerator=7 and markup_denominator=2));
 end if;
end $$;
create or replace function public.ai_meter_reserve_v2(p_actor uuid,p_wallet uuid,p_id uuid,p_ceiling integer,p_plan jsonb,p_exchange jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.ai_meter_reserve(p_actor,p_wallet,p_id,p_ceiling,p_plan,p_exchange);
 update public.ai_meter_requests set markup_numerator=7,markup_denominator=2 where id=p_id;
 return true;
end $$;
create or replace function public.ai_meter_settle(p_actor uuid,p_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.ai_meter_requests; amount numeric; charge integer; count_receipts integer;
begin
 select * into r from public.ai_meter_requests where id=p_id;
 if not found or r.actor_id is distinct from p_actor then raise exception 'METER_FORBIDDEN'; end if;
 perform 1 from public.ai_credit_wallets where id=r.wallet_id for update;
 select * into r from public.ai_meter_requests where id=p_id for update;
 if r.state='settled' then return r.actual_cents; end if;
 select count(*),sum(cost_nano_usd) into count_receipts,amount from public.ai_meter_receipts where request_id=p_id;
 if count_receipts<>jsonb_array_length(r.plan) then raise exception 'METER_UNCONFIRMED'; end if;
 if (r.exchange->>'usdDenominator')::numeric<=0 or (r.exchange->>'eurNumerator')::numeric<=0 then raise exception 'METER_INVALID'; end if;
 charge:=ceil(amount*(r.exchange->>'eurNumerator')::numeric*r.markup_numerator/
  ((r.exchange->>'usdDenominator')::numeric*10000000*r.markup_denominator))::integer;
 if charge is null or charge<0 or charge>r.ceiling_cents then raise exception 'METER_CEILING'; end if;
 update public.ai_credit_wallets set reserved_cents=reserved_cents-r.ceiling_cents,balance_cents=balance_cents-charge where id=r.wallet_id;
 insert into public.ai_credit_movements(wallet_id,source,delta_cents) values(r.wallet_id,'usage:'||p_id,-charge);
 update public.ai_meter_requests set state='settled',actual_cents=charge where id=p_id;
 return charge;
end $$;
create or replace function public.ai_credit_order_v2(p_actor uuid,p_wallet uuid,p_id uuid,p_kind text,p_amount integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_kind='credits' and (p_amount is null or p_amount not in (2000,5000,10000)) then raise exception 'METER_INVALID'; end if;
 return public.ai_credit_order(p_actor,p_wallet,p_id,p_kind,p_amount);
end $$;
revoke all on function public.ai_meter_reserve_v2(uuid,uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.ai_credit_order_v2(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.ai_meter_settle(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_meter_reserve_v2(uuid,uuid,uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.ai_credit_order_v2(uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.ai_meter_settle(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
