-- =====================================================================
-- MAZI General Trade — 09_sync_products.sql
-- Product list sync: Sept 2026 shipment, invoice MD2026-001 (60 items)
--
-- Ano ang ginagawa nito
--   * Ina-update ang mga produktong nasa database na (pangalan, category, pack,
--     unit, presyo, active) at dinadagdag ang mga wala pa (hal. Pinto Click).
--   * Presyo (MVR) = CIF unit price (USD) sa invoice x 15.42. Kapareho ng
--     PRODUCTS list sa script.js at checkout.js.
--   * FOC (free-of-charge) na items: price 0 at active = false (hindi lumalabas sa shop).
--   * HINDI ginagalaw ang stock_qty at ang stock ng mga produktong existing na —
--     kaya safe ito kahit nakapag-bilang ka na sa Admin > Stock.
--   * Safe i-run nang paulit-ulit. Kapag may pumalya, walang mase-save (isang transaction).
--
-- Paano: Supabase > SQL Editor > i-paste ang buong file > Run.
-- Sa dulo, dapat may isang row na: visible_in_shop = 52 (o mas marami kung may iba pang produkto) at active_without_price = 0.
-- =====================================================================

begin;

-- 1) Preflight: titingnan kung tugma ang table. Kapag may mali, may malinaw na error at walang binabago.
do $$
declare
  need    text[] := array['id','name','category_id','icon','pack','unit','price','stock','active'];
  missing text;
  gen     text;
  extra   text;
  ptype   text;
begin
  if to_regclass('public.products') is null then
    raise exception 'public.products does not exist. Run supabase/01_schema.sql first.';
  end if;

  select string_agg(n, ', ') into missing
  from unnest(need) n
  where not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = 'products' and c.column_name = n);
  if missing is not null then
    raise exception 'public.products is missing column(s): %', missing;
  end if;

  select string_agg(column_name, ', ') into gen
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = any(need)
    and (is_generated = 'ALWAYS' or identity_generation = 'ALWAYS');
  if gen is not null then
    raise exception 'These products columns are generated and cannot be written: %', gen;
  end if;

  select data_type into ptype
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'price';
  if ptype in ('smallint', 'integer', 'bigint') then
    raise exception 'products.price is type % and would round prices like 237.53. Run this first, then re-run this script: alter table public.products alter column price type numeric(10,2);', ptype;
  end if;

  select string_agg(column_name, ', ') into extra
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and is_nullable = 'NO' and column_default is null
    and is_generated = 'NEVER' and identity_generation is null
    and column_name <> all(need) and column_name <> 'residence_price';
  if extra is not null then
    raise exception 'products has required column(s) this script does not fill: %. Tell me and I will add them.', extra;
  end if;

  if not exists (select 1 from public.categories where id = 'household')
     or not exists (select 1 from public.categories where id = 'personal-care') then
    raise exception 'categories "household" and/or "personal-care" not found. Run supabase/02_seed.sql first.';
  end if;
end $$;

-- 2) Ang listahan (kapareho ng invoice, item #1-60)
create temp table _sync_products (
  id          text primary key,
  name        text not null,
  category_id text not null,
  icon        text,
  pack        text,
  unit        text,
  price       numeric(10,2) not null,
  stock       text not null,
  active      boolean not null,
  is_new      boolean
) on commit drop;

insert into _sync_products (id, name, category_id, icon, pack, unit, price, stock, active) values
    ('006SZ000204N', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-PINK ROSE SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 304.08, 'in', true),  -- #1  80 ctn
    ('006SZ000305', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-VIOLET SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 304.08, 'in', true),  -- #2  80 ctn
    ('006SZSB020201N', 'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-MYSTICAL PERFUME (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 304.08, 'in', true),  -- #3  40 ctn
    ('006SZ000201N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-PINK ROSE SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 234.69, 'in', true),  -- #4  80 ctn
    ('006SZ000301N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-VIOLET SCENT (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 234.69, 'in', true),  -- #5  80 ctn
    ('006SZ080801N', 'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-MYSTICAL PERFUME (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 234.69, 'in', true),  -- #6  40 ctn
    ('006SZ000202', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-PINK ROSE SCENT (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 219.27, 'in', true),  -- #7  114 ctn
    ('006SZ000302', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-VIOLET SCENT (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 219.27, 'in', true),  -- #8  114 ctn
    ('006SZSB080802', 'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-MYSTICAL PERFUME (1 X 6) CTN', 'household', '🧺', 'Carton', '1 x 6', 219.27, 'in', true),  -- #9  40 ctn
    ('001SZ20208', 'SANZOFT FABRIC SOFTENER 3800 ML.-SOFTLY TOUCH (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 165.30, 'in', true),  -- #10 30 ctn
    ('001SZ10108', 'SANZOFT FABRIC SOFTENER 3800 ML.-LOVELY PINK (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 165.30, 'in', true),  -- #11 30 ctn
    ('001SZ30307', 'SANZOFT FABRIC SOFTENER 3800 ML.-SENSE OF VIOLET (1 X 4) CTN', 'household', '🧺', 'Carton', '1 x 4', 165.30, 'in', true),  -- #12 30 ctn
    ('606SZ000501', 'SANZOFT SENSATION SPRAY 270 ML. - PINK (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 427.44, 'low', true),  -- #13 5 ctn
    ('606SZ000301', 'SANZOFT SENSATION SPRAY 270 ML. - VIOLET, (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 427.44, 'low', true),  -- #14 5 ctn
    ('606SZ000401', 'SANZOFT SENSATION SPRAY 270 ML. - BLUE, (1 X 12) CTN', 'household', '🌸', 'Carton', '1 x 12', 427.44, 'low', true),  -- #15 5 ctn
    ('101PTCL101001', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - LEMON', 'household', '🧴', 'Carton', '1 x 12', 126.75, 'in', true),  -- #16 100 ctn
    ('101PTCLK40101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - KIWI', 'household', '🧴', 'Carton', '1 x 12', 126.75, 'in', true),  -- #17 30 ctn
    ('101PTCLP20101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - PURE&CARE', 'household', '🧴', 'Carton', '1 x 12', 126.75, 'in', true),  -- #18 80 ctn
    ('101PTCLP30101', 'PINTO CLICK DISH WASHING LIQUID 750 ML. - POMELO&PASSION FRUIT', 'household', '🧴', 'Carton', '1 x 12', 126.75, 'in', true),  -- #19 30 ctn
    ('101PTLE010101', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - LEMON', 'household', '🧴', 'Carton', '1 x 12', 188.43, 'in', true),  -- #20 100 ctn
    ('101PTMA050501', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - MANGO', 'household', '🧴', 'Carton', '1 x 12', 188.43, 'in', true),  -- #21 38 ctn
    ('101PTBI010101', 'PINTO CLICK DISH WASHING LIQUID 800 ML. - BIO', 'household', '🧴', 'Carton', '1 x 12', 188.43, 'in', true),  -- #22 42 ctn
    ('101PTLE010102Y2', 'PINTO DISH WASHING LIQUID 3600 ML. - LEMON (PUMP 1 X 2)', 'household', '🧴', 'Carton', '1 x 2', 103.62, 'in', true),  -- #23 80 ctn
    ('101PTKL000002', 'PINTO DISH WASHING LIQUID 3600 ML. - KLEAR (PUMP 1 X 2)', 'household', '🧴', 'Carton', '1 x 2', 103.62, 'in', true),  -- #24 80 ctn
    ('607CF01001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- AGARWOOD, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #25 10 ctn
    ('607CF02001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- COFFEE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #26 10 ctn
    ('607CF03001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- ROSE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #27 10 ctn
    ('607CF04001', 'CAREFOR AIR FRESHENER GEL 180 GRAM.- LEMON GRASS, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #28 10 ctn
    ('607RF01001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-JASMINE, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #29 10 ctn
    ('607RF02001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LAVENDER, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #30 10 ctn
    ('607RF04001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LEMON, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #31 10 ctn
    ('607RF05001', 'R-FRESH AIR FRESHENER GEL 180 GRAM.-LILY, (1 X 24) CTN', 'household', '🌸', 'Carton', '1 x 24', 381.18, 'in', true),  -- #32 10 ctn
    ('607CR00101', 'CLEAREX EUCALYPTUS OIL AIR FRESHENER GEL 180G', 'household', '🌸', 'Carton', '1 x 24', 0.00, 'low', false),  -- #33 2 ctn  FOC (free of charge) -> hidden, no price
    ('607BN00201', 'ZLEEP EASY BY BANNE DEEP SLEEP AIR GEL 180 G', 'household', '🌸', 'Carton', '1 x 24', 0.00, 'low', false),  -- #34 2 ctn  FOC (free of charge) -> hidden, no price
    ('501DW50501', 'DAIWA LIQUID HAND SOAP 500 ML. - FRUITY , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 211.56, 'in', true),  -- #35 40 ctn
    ('501DW20201', 'DAIWA LIQUID HAND SOAP 500 ML. - LAVENDER , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 211.56, 'in', true),  -- #36 40 ctn
    ('501DW30301', 'DAIWA LIQUID HAND SOAP 500 ML. - MELON , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 211.56, 'in', true),  -- #37 40 ctn
    ('501DW00103', 'DAIWA LIQUID HAND SOAP 500 ML. - FRAGRANCE RICE , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 211.56, 'in', true),  -- #38 40 ctn
    ('501DW40401', 'DAIWA LIQUID HAND SOAP 500 ML. - GENTLE SCENT , (1 X 12) CTN', 'household', '🧼', 'Carton', '1 x 12', 211.56, 'in', true),  -- #39 40 ctn
    ('501DW00101', 'DAIWA LIQUID HAND SOAP 3500 ML. - FRUITY , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 0.00, 'low', false),  -- #40 1 ctn  FOC (free of charge) -> hidden, no price
    ('501DW50502', 'DAIWA LIQUID HAND SOAP 3500 ML. - LAVENDER , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 0.00, 'low', false),  -- #41 1 ctn  FOC (free of charge) -> hidden, no price
    ('501DW20202', 'DAIWA LIQUID HAND SOAP 3500 ML. - MELON , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 0.00, 'low', false),  -- #42 1 ctn  FOC (free of charge) -> hidden, no price
    ('501DW30302', 'DAIWA LIQUID HAND SOAP 3500 ML. - FRAGRANCE RICE , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 0.00, 'low', false),  -- #43 1 ctn  FOC (free of charge) -> hidden, no price
    ('501DW40402', 'DAIWA LIQUID HAND SOAP 3500 ML. - GENTLE SCENT , (1 X 4) CTN', 'household', '🧼', 'Carton', '1 x 4', 0.00, 'low', false),  -- #44 1 ctn  FOC (free of charge) -> hidden, no price
    ('104DW10105', 'DAIWA FLOOR CLEANER 900 ML. - FLORAL MIST , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 180.72, 'in', true),  -- #45 20 ctn
    ('104DW40402', 'DAIWA FLOOR CLEANER 900 ML. - AQUA BLUE , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 180.72, 'in', true),  -- #46 20 ctn
    ('104DW20202', 'DAIWA FLOOR CLEANER 900 ML. - LAVENDER , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 180.72, 'in', true),  -- #47 20 ctn
    ('104DW30302', 'DAIWA FLOOR CLEANER 900 ML. - LEMON , (1 X 10) CTN', 'household', '🧹', 'Carton', '1 x 10', 180.72, 'in', true),  -- #48 20 ctn
    ('104DW10107', 'DAIWA FLOOR CLEANER 3800 ML.-FLORAL MIST SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 203.85, 'in', true),  -- #49 20 ctn
    ('104DW40405', 'DAIWA FLOOR CLEANER 3800 ML.-AQUA BLUE , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 203.85, 'in', true),  -- #50 20 ctn
    ('104DW20205', 'DAIWA FLOOR CLEANER 3800 ML.-LAVENDER SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 203.85, 'in', true),  -- #51 20 ctn
    ('104DW30305', 'DAIWA FLOOR CLEANER 3800 ML.-LEMON SCENT , (1 X 4) CTN', 'household', '🧹', 'Carton', '1 x 4', 203.85, 'in', true),  -- #52 20 ctn
    ('101DW00008', 'DAIWA DISH WASHING LIQUID 800 ML. - HYGIENE , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 142.17, 'in', true),  -- #53 50 ctn
    ('101DW10304', 'DAIWA DISH WASHING LIQUID 800 ML. - LEMON , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 142.17, 'in', true),  -- #54 50 ctn
    ('101DW000501', 'DAIWA DISH WASHING LIQUID 800 ML. - MINT , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 142.17, 'in', true),  -- #55 50 ctn
    ('102DW10003', 'DAIWA GLASS CLEANER 600 ML. , (1 X 12) CTN', 'household', '🪟', 'Carton', '1 x 12', 203.85, 'in', true),  -- #56 50 ctn
    ('103DW10101', 'DAIWA GLOSS DAILY CLEANER 500 ML. , (1 X 12) CTN', 'household', '✨', 'Carton', '1 x 12', 211.56, 'in', true),  -- #57 50 ctn
    ('108DW10103', 'DAIWA DISINFECTANT DEODORIZER 3500 ML. , (1 X 4) CTN', 'household', '🧴', 'Carton', '1 x 4', 237.53, 'in', true),  -- #58 10 ctn
    ('107DW10102', 'DAIWA DISINFECTANT DEODORIZER 500 ML. , (1 X 12) CTN', 'household', '🧴', 'Carton', '1 x 12', 211.56, 'in', true),  -- #59 100 ctn
    ('503ZS00101', 'ZENSI NATURAL CLEANSING SHOWER 450 ML.', 'personal-care', '🚿', 'Carton', '1 x 12', 0.00, 'low', false);  -- #60 5 ctn  FOC (free of charge) -> hidden, no price

update _sync_products t
   set is_new = not exists (select 1 from public.products p where p.id = t.id);

-- 3) Existing na produkto: ayusin ang data. (stock at stock_qty: hindi ginagalaw)
update public.products p
   set name        = t.name,
       category_id = t.category_id,
       icon        = t.icon,
       pack        = t.pack,
       unit        = t.unit,
       price       = t.price,
       active      = t.active
  from _sync_products t
 where p.id = t.id;

-- 4) Bagong produkto: idagdag. (stock_qty ay walang laman = "Not tracked" hanggang maglagay ka sa Admin > Stock)
do $$
declare
  cols text := 'id, name, category_id, icon, pack, unit, price, stock, active';
  sel  text := 't.id, t.name, t.category_id, t.icon, t.pack, t.unit, t.price, t.stock, t.active';
begin
  -- kung may residence_price column, kapareho muna ng price (puwede mong baguhin mamaya)
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'products' and column_name = 'residence_price') then
    cols := cols || ', residence_price';
    sel  := sel  || ', t.price';
  end if;
  execute format('insert into public.products (%s) select %s from _sync_products t where t.is_new', cols, sel);
end $$;

-- 5) Verification: kapag may hindi tumugma, ma-rollback ang lahat.
do $$
declare bad text;
begin
  select string_agg(t.id, ', ') into bad
  from _sync_products t
  left join public.products p on p.id = t.id
  where p.id is null
     or p.name        is distinct from t.name
     or p.category_id is distinct from t.category_id
     or p.pack        is distinct from t.pack
     or p.unit        is distinct from t.unit
     or p.active      is distinct from t.active
     or abs(p.price::numeric - t.price) > 0.005;
  if bad is not null then
    raise exception 'Verification failed for: %. Nothing was saved.', bad;
  end if;
end $$;

commit;

-- 6) Buod (dapat: active_without_price = 0)
select count(*)                                   as total,
       count(*) filter (where active)             as visible_in_shop,
       count(*) filter (where not active)         as hidden,
       count(*) filter (where active and coalesce(price, 0) <= 0) as active_without_price,
       count(*) filter (where stock_qty is null)  as stock_not_tracked
from public.products;

-- Mamaya, kapag may presyo na ang isang FOC item (hal. 501DW00101):
--   update public.products set price = 185.04, active = true where id = '501DW00101';
--   ...at i-uncomment din ang linya niya sa PRODUCTS list ng script.js at checkout.js.
