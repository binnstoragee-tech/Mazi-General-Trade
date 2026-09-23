-- ============================================================
-- MAZI — orders go-live check  (safe to run any time, changes almost nothing)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- PART 1  turns on Realtime for the orders table (so customers see status
--         changes instantly). Safe to re-run.
-- PART 2  is a checklist: every row should say  ok = true.
-- PART 3  (edit + run separately) makes YOUR account a staff/admin account
--         so you can open admin.html.
-- ============================================================

-- PART 1 — realtime for orders
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- PART 2 — checklist (all rows must be true)
select 'orders table'                as item, to_regclass('public.orders') is not null as ok
union all select 'order_items table',           to_regclass('public.order_items') is not null
union all select 'create_order()',              to_regprocedure('public.create_order(jsonb)') is not null
union all select 'cancel_order()',              to_regprocedure('public.cancel_order(text)') is not null
union all select 'admin_set_order_status()',    to_regprocedure('public.admin_set_order_status(text,text,numeric,text,text)') is not null
union all select 'ensure_profile()',            to_regprocedure('public.ensure_profile()') is not null
union all select 'payment-slips bucket',        exists (select 1 from storage.buckets where id = 'payment-slips')
union all select 'realtime on orders',          exists (select 1 from pg_publication_tables
                                                        where pubname = 'supabase_realtime' and tablename = 'orders')
union all select 'active products (>0)',        (select count(*) from public.products where active) > 0
union all select 'at least one admin account',  exists (select 1 from public.profiles where is_admin);

-- PART 3 — make yourself staff. Replace the email, then run THIS line on its own.
-- (Sign up on the website with this email first, and confirm the email.)
--
-- update public.profiles set is_admin = true where email = 'YOUR-EMAIL@example.com';
