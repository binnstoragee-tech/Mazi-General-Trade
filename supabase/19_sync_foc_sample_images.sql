-- ============================================================
-- MAZI — Sync product photos for the 8 FOC (free-of-charge)
-- sample items from shipment MD2026-001, so the database matches
-- the same photos now used in script.js / checkout.js.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- These 8 products have no retail price yet (supplier gave them
-- free of charge, so there's no cost to base a price on) and stay
-- Hidden (active = false) in the admin Stock page until staff sets
-- a price. This migration only fills in image_url — it does NOT
-- change price or active status.
-- ============================================================

update public.products set image_url = 'img/household&cleaning/501DW30302.png'
  where id = '501DW30302' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/501DW00101.png'
  where id = '501DW00101' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/501DW40402.png'
  where id = '501DW40402' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/501DW50502.png'
  where id = '501DW50502' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/501DW20202.png'
  where id = '501DW20202' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/607CR00101.png'
  where id = '607CR00101' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/607BN00201.png'
  where id = '607BN00201' and (image_url is null or image_url = '');
update public.products set image_url = 'img/household&cleaning/503ZS00101.png'
  where id = '503ZS00101' and (image_url is null or image_url = '');

-- ---------- quick check ----------
select id, name, price, active, image_url
from public.products
where id in ('501DW30302','501DW00101','501DW40402','501DW50502',
             '501DW20202','607CR00101','607BN00201','503ZS00101')
order by id;
