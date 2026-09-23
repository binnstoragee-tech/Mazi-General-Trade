-- ============================================================
-- MAZI — set EVERY product price to 0 (temporary)
-- Run this once in Supabase → SQL Editor so the server matches the
-- website (script.js / checkout.js already show 0 for all products).
-- Orders are priced by the server, so without this the shop would still
-- charge the old prices at checkout.
--
-- To put a real price back later:
--   update public.products set price = 1234 where id = '108DW10103';
-- ============================================================

update public.products
   set price = 0,
       residence_price = null;   -- NULL = same as price

-- Check: every row should show max_price = 0
select count(*) as products, max(price) as max_price, max(residence_price) as max_residence_price
from public.products;
