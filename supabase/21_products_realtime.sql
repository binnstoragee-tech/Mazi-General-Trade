-- ============================================================
-- MAZI — Realtime for products
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- What it does:
--   Adds public.products to the supabase_realtime publication, the same
--   way 01_schema.sql already did for public.orders. Once this is run,
--   any stock/price/name/image/active change staff make in admin -> Stock
--   is pushed to shoppers' devices immediately (RLS still applies, so
--   shoppers only ever hear about products where active = true).
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;
