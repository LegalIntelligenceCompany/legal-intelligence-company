begin;
create table if not exists public.assistant_requests (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'processing' check(status in ('processing','completed','failed')),
 created_at timestamptz not null default now()
);
create index if not exists assistant_requests_user_created on public.assistant_requests(user_id,created_at);
alter table public.assistant_requests enable row level security;
revoke all on public.assistant_requests from public,anon,authenticated;
grant select,insert,update,delete on public.assistant_requests to service_role;
create or replace function public.assistant_begin(p_id uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'FORBIDDEN'; end if;
 -- Serialise admission so concurrent actors cannot exceed the global quota.
 perform pg_advisory_xact_lock(71842005);
 if exists(select 1 from public.assistant_requests where id=p_id) then raise exception 'DUPLICATE'; end if;
 if exists(select 1 from public.assistant_requests where user_id=p_actor and status='processing' and created_at>now()-interval '5 minutes') then raise exception 'BUSY'; end if;
 if (select count(*) from public.assistant_requests where user_id=p_actor and created_at>now()-interval '24 hours')>=20
 or (select count(*) from public.assistant_requests where created_at>now()-interval '24 hours')>=200 then raise exception 'RATE_LIMITED'; end if;
 insert into public.assistant_requests(id,user_id) values(p_id,p_actor);
end $$;
create or replace function public.assistant_finish(p_id uuid,p_actor uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.assistant_requests set status=case when p_success then 'completed' else 'failed' end
 where id=p_id and user_id=p_actor and status='processing';
end $$;
revoke all on function public.assistant_begin(uuid,uuid) from public,anon,authenticated;
revoke all on function public.assistant_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.assistant_begin(uuid,uuid) to service_role;
grant execute on function public.assistant_finish(uuid,uuid,boolean) to service_role;
commit;
