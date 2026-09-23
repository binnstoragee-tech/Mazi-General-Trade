-- ============================================================
-- MAZI — Point every product's image_url to its photo
-- Run once in Supabase → SQL Editor (paste all → Run).
-- Safe to re-run.
--
-- Convention already used by the storefront (script.js):
--   img/household&cleaning/<PRODUCT_ID>.png
-- All product photos live in that one folder, named by the
-- product's id, regardless of category.
-- ============================================================

update public.products
   set image_url = 'img/household&cleaning/' || id || '.png';

-- quick check: should show a path for every row
select id, name, image_url from public.products order by name limit 10;
