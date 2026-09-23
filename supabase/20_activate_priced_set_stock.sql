-- ============================================================
-- MAZI — Activate all priced products, set stock quantities
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- What it does:
--   1) Turns ON any product that has a real price (>0) but is still
--      marked inactive/hidden from the shop.
--   2) Sets stock_qty = 50 for every product with a price (shows "In Stock").
--   3) Sets stock_qty = 0 for every product with price 0 (FOC/no cost yet)
--      and keeps it hidden from the shop until it gets a real price.
-- ============================================================

begin;

-- 1) Activate anything priced but still inactive
update public.products
set active = true
where price > 0 and active = false;

-- 2) Priced products -> 50 units in stock
update public.products
set stock_qty = 50
where price > 0;

-- 3) Zero-price (FOC) products -> 0 stock, hidden from shop
update public.products
set stock_qty = 0,
    active = false
where price <= 0;

commit;

-- Check the result
select count(*)                             as total,
       count(*) filter (where active)       as visible_in_shop,
       count(*) filter (where not active)   as hidden_no_price
from public.products;
