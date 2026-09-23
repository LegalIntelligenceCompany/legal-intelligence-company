-- Extend receipt accounting to audio. Does not fund wallets or enable billing.
begin;
alter table public.ai_meter_receipts drop constraint if exists ai_meter_receipts_response_id_check;
alter table public.ai_meter_receipts add constraint ai_meter_receipts_response_id_check check(response_id ~ '^(resp_|req_|skip_)[A-Za-z0-9_-]+$');
create or replace function public.ai_meter_record(p_actor uuid,p_id uuid,p_stage integer,p_usage jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ai_meter_requests; old public.ai_meter_receipts; s jsonb; t jsonb; amount numeric;
 i bigint; c bigint; o bigint; searches bigint; a bigint;
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
 i:=(p_usage->>'input')::bigint; c:=(p_usage->>'cachedInput')::bigint;
 o:=(p_usage->>'output')::bigint; searches:=(p_usage->>'webSearchCalls')::bigint; a:=coalesce((p_usage->>'audioInput')::bigint,0);
 if i is null or c is null or o is null or searches is null or i<0 or c<0 or c>i or o<0 or searches<0 or a<0 or a>i-c
  or i>(s->>'maxInput')::bigint or o>(s->>'maxOutput')::bigint or searches>(s->>'maxWebSearchCalls')::bigint then raise exception 'METER_CEILING'; end if;
 if a>0 and (t->>'audioInputNanoUsd' is null or (t->>'audioInputNanoUsd')::numeric<=0) then raise exception 'METER_TARIFF'; end if;
 if p_usage->>'responseId' like 'skip_%' and (i<>0 or c<>0 or o<>0 or searches<>0 or a<>0 or p_usage->>'reason' is distinct from 'no_research_jurisdiction') then raise exception 'METER_INVALID'; end if;
 amount:=(i-c-a)::numeric*(t->>'inputNanoUsd')::numeric+c::numeric*(t->>'cachedInputNanoUsd')::numeric
  +o::numeric*(t->>'outputNanoUsd')::numeric+searches::numeric*(t->>'webSearchNanoUsd')::numeric
  +a::numeric*coalesce((t->>'audioInputNanoUsd')::numeric,0);
 insert into public.ai_meter_receipts(request_id,stage,response_id,usage,cost_nano_usd)
 values(p_id,p_stage,p_usage->>'responseId',p_usage,amount);
 return true;
end $$;
revoke all on function public.ai_meter_record(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ai_meter_record(uuid,uuid,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
