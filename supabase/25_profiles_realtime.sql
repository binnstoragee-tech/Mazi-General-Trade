-- ============================================================
-- MAZI — Realtime for profiles
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- What it does:
--   Adds public.profiles to the supabase_realtime publication, the same
--   way 21_products_realtime.sql did for public.products. Once this is
--   run, any change to a customer's name in the storefront's Personal
--   Details (and any other profile field) is pushed to the admin
--   dashboard's Staff Access page immediately, instead of waiting for the
--   30-second poll.
--
--   No new RLS is added here: the existing profiles_select policy from
--   01_schema.sql ("id = auth.uid() or public.is_admin()") already lets
--   staff/admin accounts see every profile row, so Realtime only ever
--   delivers these changes to accounts with is_admin = true.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
