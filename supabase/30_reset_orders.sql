-- ============================================================
-- MAZI — reset all orders before going live (run once)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
--
-- What it does:
--   Deletes every order and order line item (order_items cascade-deletes
--   automatically via its FK to orders), and resets the order number
--   counter so the next real order starts fresh at #1.
--
--   Does NOT touch products, prices, accounts/profiles, or anything else.
--
-- Run this LAST, right before you actually go live — not before, in case
-- you place more test orders after running it.
-- ============================================================

-- 1. Delete all orders (order_items cascade-deletes automatically)
delete from public.orders;

-- 2. Reset the order number counter so the next real order starts at #1 again
delete from public.order_counters;

-- Check: both should show 0
select count(*) as orders_left from public.orders;
select count(*) as counters_left from public.order_counters;
