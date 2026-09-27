-- ============================================================
-- MAZI — seed data (run AFTER 01_schema.sql)
-- Focus: DAIWA, SANZOFT, CAREFOR, R-FRESH, PINTO, CLEAREX, ZLEEP EASY, ZENSI (60 products,
-- matching every item in "products for MGT.xlsx" > PACKING LIST sheet)
-- Product ID = backend CODE; product name = exactly as in the backend
-- system (MIQA Product Assistant).
--
-- Prices: synced from the "Selling case" column of the PACKING LIST sheet in
-- "products for MGT.xlsx". 53 products have a price. 7 have NO price yet
-- (price = 0, active = false => hidden from the shop) because the packing list
-- doesn't list a selling price for them yet. Set the price and unhide with:
--   update public.products set price = 1234, active = true where id = '101DW00008';
--
-- Stock: backend quantity -> 'in' (6+), 'low' (1-5), 'out' (0).
-- WARNING: re-running RESETS these products' names/prices/stock/active
-- back to the values below — and ERASES stock quantities entered in /admin
-- (08_stock.sql). Once you track stock, do NOT re-run this file.
-- Safe to run more than once.
-- ============================================================

begin;

-- clear the old 81-product seed (categories are kept; empty ones just show 'no results')
delete from public.products;

insert into public.app_config (key, value) values
  ('mvr_per_usd',            '15.42'::jsonb),
  ('gst_rate',               '0.08'::jsonb),
  ('free_delivery_over_mvr', '500'::jsonb),
  ('male_islands',           '["Male''", "Hulhumale''"]'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.categories (id, name, sort_order) values
  ('dairy', 'Dairy', 1),
  ('tea', 'Tea', 2),
  ('coffee', 'Coffee & Instants', 3),
  ('beverages', 'Beverages', 4),
  ('dried-fruits', 'Dates & Dried Fruits', 5),
  ('grains', 'Grains, Cereals & Spreads', 6),
  ('confectionary', 'Confectionary & Snacks', 7),
  ('canned', 'Canned Foods', 8),
  ('cooking', 'Cooking & Baking', 9),
  ('personal-care', 'Personal Care', 10),
  ('sauces', 'Sauces & Oils', 11),
  ('household', 'Household & Cleaning', 12)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.products (id, name, category_id, icon, pack, unit, price, stock, image_url, active) values
  ('101DW00008', 'DAIWA DISH WASHING LIQUID 800 ML. - HYGIENE , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 0, 'in', null, false),
  ('101DW10304', 'DAIWA DISH WASHING LIQUID 800 ML. - LEMON , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 0, 'in', null, false),
  ('101DW000501', 'DAIWA DISH WASHING LIQUID 800 ML. - MINT , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 0, 'in', null, false),
  ('108DW10103', 'DAIWA DISINFECTANT DEODORIZER 3500 ML. , (1 X 4) CTN', 'household', '🧴', 'Carton', '1 x 4', 1350, 'in', null, true),
  ('107DW10102', 'DAIWA DISINFECTANT DEODORIZER 500 ML. , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 0, 'in', null, false),
  ('104DW40405', 'DAIWA FLOOR CLEANER 3800 ML.-AQUA BLUE , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 590, 'in', null, true),
  ('104DW10107', 'DAIWA FLOOR CLEANER 3800 ML.-FLORAL MIST SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 590, 'in', null, true),
  ('104DW20205', 'DAIWA FLOOR CLEANER 3800 ML.-LAVENDER SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 590, 'in', null, true),
  ('104DW30305', 'DAIWA FLOOR CLEANER 3800 ML.-LEMON SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 590, 'in', null, true),
  ('104DW40402', 'DAIWA FLOOR CLEANER 900 ML. - AQUA BLUE , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 450, 'in', null, true),
  ('104DW10105', 'DAIWA FLOOR CLEANER 900 ML. - FLORAL MIST , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 450, 'in', null, true),
  ('104DW20202', 'DAIWA FLOOR CLEANER 900 ML. - LAVENDER , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 450, 'in', null, true),
  ('104DW30302', 'DAIWA FLOOR CLEANER 900 ML. - LEMON , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 450, 'in', null, true),
  ('102DW10003', 'DAIWA GLASS CLEANER 600 ML. , (1 X 12) CTN', 'household', '🪟', 'Carton', '1 x 12', 380, 'in', null, true),
  ('103DW10101', 'DAIWA GLOSS DAILY CLEANER 500 ML. , (1 X 12) CTN', 'household', '✨', 'Carton', '1 x 12', 380, 'in', null, true),
  ('501DW30302', 'DAIWA LIQUID HAND SOAP 3500 ML. - FRAGRANCE RICE , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 1250, 'low', null, true),
  ('501DW00101', 'DAIWA LIQUID HAND SOAP 3500 ML. - FRUITY , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 1250, 'low', null, true),
  ('501DW40402', 'DAIWA LIQUID HAND SOAP 3500 ML. - GENTLE SCENT , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 1250, 'low', null, true),
  ('501DW50502', 'DAIWA LIQUID HAND SOAP 3500 ML. - LAVENDER , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 1250, 'low', null, true),
  ('501DW20202', 'DAIWA LIQUID HAND SOAP 3500 ML. - MELON , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 1250, 'low', null, true),
  ('501DW00103', 'DAIWA LIQUID HAND SOAP 500 ML. - FRAGRANCE RICE , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 400, 'in', null, true),
  ('501DW50501', 'DAIWA LIQUID HAND SOAP 500 ML. - FRUITY , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 400, 'in', null, true),
  ('501DW40401', 'DAIWA LIQUID HAND SOAP 500 ML. - GENTLE SCENT , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 400, 'in', null, true),
  ('501DW20201', 'DAIWA LIQUID HAND SOAP 500 ML. - LAVENDER , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 400, 'in', null, true),
  ('501DW30301', 'DAIWA LIQUID HAND SOAP 500 ML. - MELON , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 400, 'in', null, true),
  ('001SZ10108', 'SANZOFT FABRIC SOFTENER 3800 ML.-LOVELY PINK (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 500, 'in', 'img/household&cleaning/Sanzoft Fabric Softener 3800 ml. -Lovely Pink.jpg', true),
  ('001SZ30307', 'SANZOFT FABRIC SOFTENER 3800 ML.-SENSE OF VIOLET (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 500, 'in', 'img/household&cleaning/Sanzoft Fabric Softener 3800 ml. -Sense of Violet.jpg', true),
  ('001SZ20208', 'SANZOFT FABRIC SOFTENER 3800 ML.-SOFTLY TOUCH (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 500, 'in', 'img/household&cleaning/Sanzoft Fabric Softener 3800 ml. -Softly Touch.jpg', true),
  ('006SZSB080802', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-MYSTICAL PERFUME (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 650, 'in', null, true),
  ('006SZ000202', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-PINK ROSE SCENT (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 650, 'in', null, true),
  ('006SZ000302', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-VIOLET SCENT (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 650, 'in', null, true),
  ('006SZ080801N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-MYSTICAL PERFUME (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 575, 'in', null, true),
  ('006SZ000201N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-PINK ROSE SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 575, 'in', null, true),
  ('006SZ000301N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-VIOLET SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 575, 'in', null, true),
  ('006SZSB020201N', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-MYSTICAL PERFUME (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 950, 'in', null, true),
  ('006SZ000204N', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-PINK ROSE SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 950, 'in', 'img/household&cleaning/Sanzoft Laundry Liquid Detergent 5000 ml.-Pink Rose Scent.jpg', true),
  ('006SZ000305', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-VIOLET SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 950, 'in', 'img/household&cleaning/Sanzoft Laundry Liquid Detergent 5000 ml.-Violet Scent.jpg', true),
  ('606SZ000401', 'SANZOFT SENSATION SPRAY 270 ML. - BLUE, (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 1080, 'low', null, true),
  ('606SZ000501', 'SANZOFT SENSATION SPRAY 270 ML. - PINK (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 1080, 'low', null, true),
  ('606SZ000301', 'SANZOFT SENSATION SPRAY 270 ML. - VIOLET, (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 1080, 'low', null, true),
  ('607CF01001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- AGARWOOD, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', null, true),
  ('607CF02001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- COFFEE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/Carefor Air Freshener Gel 180 gram.- Coffee.jpg', true),
  ('607CF04001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- LEMON GRASS, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/Carefor Air Freshener Gel 180 gram.- Lemon Grass.jpg', true),
  ('607CF03001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- ROSE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/Carefor Air Freshener Gel 180 gram.- Rose.jpg', true),
  ('607RF01001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-JASMINE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/R-Fresh Air Freshener Gel 180 gram.- Jasmine.jpg', true),
  ('607RF02001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LAVENDER, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/R-Fresh Air Freshener Gel 180 gram.-Lavender.jpg', true),
  ('607RF04001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LEMON, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/R-Fresh Air Freshener Gel 180 gram.- Lemon.jpg', true),
  ('607RF05001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LILY, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 1180, 'in', 'img/household&cleaning/R-Fresh Air Freshener Gel 180 gram.-Lily.jpg', true),
  -- Added from packing list (were missing from the shop entirely). Pack/unit sizes are not
  -- in the packing list, so they're estimated from similar-sized products above — confirm before relying on them.
  ('101PTCL101001', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - LEMON , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 299, 'in', null, true),
  ('101PTCLK40101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - KIWI , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 299, 'in', null, true),
  ('101PTCLP20101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - PURE&CARE , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 299, 'in', null, true),
  ('101PTCLP30101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - POMELO&PASSION FRUIT , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 299, 'in', null, true),
  ('101PTLE010101', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - LEMON , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 500, 'in', null, true),
  ('101PTMA050501', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - MANGO , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 500, 'in', null, true),
  ('101PTBI010101', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - BIO , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 500, 'in', null, true),
  ('101PTLE010102Y2', 'PINTO DISH WASHING LIQUID 3600 ML. - LEMON (PUMP 1X2) CTN', 'household', '🧴', 'Carton', '1 x 2', 275, 'in', null, true),
  ('101PTKL000002', 'PINTO DISH WASHING LIQUID 3600 ML. - KLEAR (PUMP 1X2) CTN', 'household', '🧴', 'Carton', '1 x 2', 275, 'in', null, true),
  ('607CR00101', 'CLEAREX EUCALYPTUS OIL AIR FRESHENER GEL 180 G. , (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 0, 'in', null, false),
  ('607BN00201', 'ZLEEP EASY BY BANNE DEEP SLEEP AIR GEL 180 G. , (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 0, 'in', null, false),
  ('503ZS00101', 'ZENSI NATURAL CLEANSING SHOWER 450 ML. , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 0, 'in', null, false)
on conflict (id) do update set
  name = excluded.name, category_id = excluded.category_id, icon = excluded.icon,
  pack = excluded.pack, unit = excluded.unit, price = excluded.price,
  stock = excluded.stock, image_url = excluded.image_url, active = excluded.active;

commit;

-- Check: should return 60 total, 53 active, 7 hidden (no price yet)
select count(*) as total,
       count(*) filter (where active) as active,
       count(*) filter (where not active) as no_price_yet
from public.products;
