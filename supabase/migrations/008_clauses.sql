-- Requires 007_library.sql. Reuses owner-only RLS and quotas; no paid calls.
begin;
alter table public.research_dossiers drop constraint if exists research_dossiers_kind_check;
alter table public.research_dossiers add constraint research_dossiers_kind_check check (kind in ('dossier','watch','clause'));
commit;
