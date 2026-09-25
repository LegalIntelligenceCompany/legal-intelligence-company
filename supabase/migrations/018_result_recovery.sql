begin;
create table if not exists public.service_results (
 id uuid primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('assistant','transcription')),
 organization_id uuid references public.organizations(id) on delete cascade,
 document_ids uuid[] not null default '{}',
 state text not null default 'processing' check(state in ('processing','completed','uncertain')),
 result jsonb,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 check(result is null or octet_length(result::text)<=500000),
 check(array_length(document_ids,1) is null or array_length(document_ids,1)<=5)
);
create index if not exists service_results_actor_expiry on public.service_results(actor_id,expires_at);
alter table public.service_results enable row level security;
revoke all on public.service_results from public,anon,authenticated;
grant select,insert,update,delete on public.service_results to service_role;
-- No inputs, PDFs or audio are copied. Only explicitly authorised output is retained.
commit;
