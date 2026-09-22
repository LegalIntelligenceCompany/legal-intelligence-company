begin;
create table if not exists public.research_jobs (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 input jsonb not null,
 model text not null,
 state text not null default 'starting' check(state in ('starting','draft','review_starting','review','completed','failed')),
 response_id text,
 result jsonb,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours'
);
create unique index if not exists research_jobs_one_active on public.research_jobs(owner_id) where state in ('starting','draft','review_starting','review');
alter table public.research_jobs enable row level security;
revoke all on public.research_jobs from public, anon, authenticated;
grant select,insert,update,delete on public.research_jobs to service_role;
-- All access goes through authenticated server handlers, scoped by owner_id.
-- No browser role may create, change or read provider identifiers/results.
commit;
