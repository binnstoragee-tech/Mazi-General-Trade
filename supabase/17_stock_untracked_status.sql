-- ============================================================
-- MAZI — "Not tracked" products should not claim "In Stock" on the site
-- Run AFTER 08_stock.sql. Safe to re-run.
--
-- Problem: products.stock ('in'/'low'/'out') only gets kept in sync with
-- stock_qty when stock_qty is NOT NULL (see trg_sync_stock_status in
-- 08_stock.sql). Products the staff has never touched on the Stock page
-- (stock_qty IS NULL — "Not tracked yet") were left at whatever `stock`
-- value they were seeded with, almost always 'in' — so the shop showed
-- a confident "In Stock" badge for products nobody actually confirmed.
--
-- Fix: add a 4th status, 'untracked'. The trigger now sets it whenever
-- stock_qty is NULL. The site (script.js) shows no stock badge at all
-- for 'untracked' — it doesn't claim a status that was never verified —
-- but the product stays orderable, same as before.
-- ============================================================

alter table public.products drop constraint if exists products_stock_check;
alter table public.products
  add constraint products_stock_check check (stock in ('in','low','out','untracked'));

create or replace function public.trg_sync_stock_status()
returns trigger language plpgsql as $$
begin
  if new.stock_qty is null then
    new.stock := 'untracked';
  else
    new.stock := case when new.stock_qty <= 0 then 'out'
                      when new.stock_qty <= 5 then 'low'
                      else 'in' end;
  end if;
  return new;
end $$;

-- one-time fix for products that are currently stuck showing 'in'
-- even though their stock_qty has never been set
update public.products set stock = 'untracked' where stock_qty is null and stock <> 'untracked';

-- quick check
select id, name, stock, stock_qty, active from public.products order by name limit 10;
