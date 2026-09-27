-- ============================================================
-- MAZI — sync selling prices from "products for MGT.xlsx" > PACKING LIST
-- ("Selling case" column), matched by product code.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
--
-- Safe to re-run. Only touches price/active — does NOT touch stock, so this
-- is safe even after 02_seed.sql is no longer supposed to be re-run.
-- ============================================================

begin;

update public.products set price = 950, active = true where id = '006SZ000204N'; -- Sanzoft Laundry Liquid Detergent 5000ml - Pink Rose
update public.products set price = 950, active = true where id = '006SZ000305'; -- Sanzoft Laundry Liquid Detergent 5000ml - Violet
update public.products set price = 950, active = true where id = '006SZSB020201N'; -- Sanzoft Laundry Liquid Detergent 5000ml - Mystical Perfume
update public.products set price = 575, active = true where id = '006SZ000201N'; -- Sanzoft Laundry Liquid Detergent 3500ml - Pink Rose
update public.products set price = 575, active = true where id = '006SZ000301N'; -- Sanzoft Laundry Liquid Detergent 3500ml - Violet
update public.products set price = 575, active = true where id = '006SZ080801N'; -- Sanzoft Laundry Liquid Detergent 3500ml - Mystical Perfume
update public.products set price = 650, active = true where id = '006SZ000202'; -- Sanzoft Laundry Liquid Detergent 2000ml - Pink Rose
update public.products set price = 650, active = true where id = '006SZ000302'; -- Sanzoft Laundry Liquid Detergent 2000ml - Violet
update public.products set price = 650, active = true where id = '006SZSB080802'; -- Sanzoft Laundry Liquid Detergent 2000ml - Mystical Perfume
update public.products set price = 500, active = true where id = '001SZ20208'; -- Sanzoft Fabric Softener 3800ml - Softly Touch
update public.products set price = 500, active = true where id = '001SZ10108'; -- Sanzoft Fabric Softener 3800ml - Lovely Pink
update public.products set price = 500, active = true where id = '001SZ30307'; -- Sanzoft Fabric Softener 3800ml - Sense of Violet
update public.products set price = 400, active = true where id = '501DW50501'; -- Daiwa Liquid Hand Soap 500ml - Fruity
update public.products set price = 400, active = true where id = '501DW20201'; -- Daiwa Liquid Hand Soap 500ml - Lavender
update public.products set price = 400, active = true where id = '501DW30301'; -- Daiwa Liquid Hand Soap 500ml - Melon
update public.products set price = 400, active = true where id = '501DW00103'; -- Daiwa Liquid Hand Soap 500ml - Fragrance Rice
update public.products set price = 400, active = true where id = '501DW40401'; -- Daiwa Liquid Hand Soap 500ml - Gentle Scent
update public.products set price = 450, active = true where id = '104DW10105'; -- Daiwa Floor Cleaner 900ml - Floral Mist
update public.products set price = 450, active = true where id = '104DW40402'; -- Daiwa Floor Cleaner 900ml - Aqua Blue
update public.products set price = 450, active = true where id = '104DW20202'; -- Daiwa Floor Cleaner 900ml - Lavender
update public.products set price = 450, active = true where id = '104DW30302'; -- Daiwa Floor Cleaner 900ml - Lemon
update public.products set price = 590, active = true where id = '104DW10107'; -- Daiwa Floor Cleaner 3800ml - Floral Mist
update public.products set price = 590, active = true where id = '104DW40405'; -- Daiwa Floor Cleaner 3800ml - Aqua Blue
update public.products set price = 590, active = true where id = '104DW20205'; -- Daiwa Floor Cleaner 3800ml - Lavender
update public.products set price = 590, active = true where id = '104DW30305'; -- Daiwa Floor Cleaner 3800ml - Lemon
update public.products set price = 380, active = true where id = '102DW10003'; -- Daiwa Glass Cleaner 600ml
update public.products set price = 380, active = true where id = '103DW10101'; -- Daiwa Gloss Daily Cleaner 500ml
update public.products set price = 299, active = true where id = '101PTCL101001'; -- Pinto Click Dish Washing Liquid 750ml - Lemon
update public.products set price = 299, active = true where id = '101PTCLK40101'; -- Pinto Click Dish Washing Liquid 750ml - Kiwi
update public.products set price = 299, active = true where id = '101PTCLP20101'; -- Pinto Click Dish Washing Liquid 750ml - Pure&Care
update public.products set price = 299, active = true where id = '101PTCLP30101'; -- Pinto Click Dish Washing Liquid 750ml - Pomelo&Passion Fruit
update public.products set price = 500, active = true where id = '101PTLE010101'; -- Pinto Click Dish Washing Liquid 800ml - Lemon
update public.products set price = 500, active = true where id = '101PTMA050501'; -- Pinto Click Dish Washing Liquid 800ml - Mango
update public.products set price = 500, active = true where id = '101PTBI010101'; -- Pinto Click Dish Washing Liquid 800ml - Bio
update public.products set price = 275, active = true where id = '101PTLE010102Y2'; -- Pinto Dish Washing Liquid 3600ml - Lemon (Pump 1x2)
update public.products set price = 275, active = true where id = '101PTKL000002'; -- Pinto Dish Washing Liquid 3600ml - Klear (Pump 1x2)

commit;

-- Check: these are the ones still with no selling price in the packing list
-- (leave hidden until a price is confirmed)
select id, name, price, active from public.products
where id in ('101DW00008','101DW10304','101DW000501','107DW10102','607CR00101','607BN00201','503ZS00101');
