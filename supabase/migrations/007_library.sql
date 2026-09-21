-- Personal research library. No scheduled jobs, provider calls or email delivery.
begin;
create table if not exists public.research_dossiers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 kind text not null check(kind in ('dossier','watch')) default 'dossier',
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=4000),
 created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table if not exists public.research_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 dossier_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null check(length(body) between 1 and 80000),
 sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=100 and octet_length(sources::text)<=60000),
 created_at timestamptz not null default now(),
 foreign key(dossier_id,owner_id) references public.research_dossiers(id,owner_id) on delete cascade
);
create index if not exists research_entries_dossier_date on public.research_entries(dossier_id,created_at);
alter table public.research_dossiers enable row level security;
alter table public.research_entries enable row level security;
revoke all on public.research_dossiers,public.research_entries from public,anon,authenticated;
grant select,insert,update,delete on public.research_dossiers,public.research_entries to authenticated;
drop policy if exists research_dossiers_owner on public.research_dossiers;
create policy research_dossiers_owner on public.research_dossiers to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists research_entries_owner on public.research_entries;
create policy research_entries_owner on public.research_entries to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create or replace function public.research_library_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,771));
 if tg_table_name='research_dossiers' then
  if (select count(*) from public.research_dossiers where owner_id=new.owner_id)>=100 then raise exception 'LIBRARY_LIMIT'; end if;
 else
  if (select count(*) from public.research_entries where owner_id=new.owner_id)>=1000 then raise exception 'LIBRARY_LIMIT'; end if;
 end if;
 return new;
end $$;
revoke all on function public.research_library_limit() from public,anon,authenticated;
drop trigger if exists research_dossiers_limit on public.research_dossiers;
create trigger research_dossiers_limit before insert on public.research_dossiers for each row execute function public.research_library_limit();
drop trigger if exists research_entries_limit on public.research_entries;
create trigger research_entries_limit before insert on public.research_entries for each row execute function public.research_library_limit();
notify pgrst,'reload schema';
commit;
