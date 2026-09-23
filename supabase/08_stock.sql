-- ============================================================
-- MAZI — STOCK CONTROL  (run AFTER 01_schema.sql and 02_seed.sql)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- What it adds
--   * products.stock_qty   real number of units left (NULL = "not tracked yet")
--   * the shop's In stock / Low / Out label follows stock_qty automatically
--       0 = Out of stock · 1-5 = Low stock · 6+ = In stock
--   * every order takes its quantity OFF the stock; cancelling gives it back
--   * an order for more than what is left is refused ("not enough stock")
--   * stock_log  history of every change (restock, sale, cancel)
--   * admin_adjust_stock()  used by the Stock page in /admin
--
-- IMPORTANT: do NOT re-run 02_seed.sql after this — it wipes the products
-- table and therefore the stock quantities you entered.
-- ============================================================

alter table public.products
  add column if not exists stock_qty int check (stock_qty is null or stock_qty >= 0);

-- ---------- history ----------
create table if not exists public.stock_log (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products(id) on delete cascade,
  change      int  not null,             -- +24 restock, -3 sold ...
  qty_after   int  not null,
  reason      text not null check (reason in ('restock','set','order','cancel')),
  order_id    text,
  by_user     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists stock_log_product_idx on public.stock_log(product_id, created_at desc);
create index if not exists stock_log_order_idx   on public.stock_log(order_id);

alter table public.stock_log enable row level security;
revoke all on public.stock_log from anon, authenticated;
grant select on public.stock_log to authenticated;
drop policy if exists stock_log_admin on public.stock_log;
create policy stock_log_admin on public.stock_log for select using (public.is_admin());

-- ---------- keep the In/Low/Out label in sync with the number ----------
create or replace function public.trg_sync_stock_status()
returns trigger language plpgsql as $$
begin
  if new.stock_qty is not null then
    new.stock := case when new.stock_qty <= 0 then 'out'
                      when new.stock_qty <= 5 then 'low'
                      else 'in' end;
  end if;
  return new;
end $$;
drop trigger if exists sync_stock_status on public.products;
create trigger sync_stock_status
  before insert or update of stock_qty on public.products
  for each row execute function public.trg_sync_stock_status();

-- ---------- an order takes stock off ----------
create or replace function public.trg_order_item_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_qty int;
begin
  if new.product_id is null then return new; end if;
  select stock_qty into v_qty from public.products where id = new.product_id for update;
  if v_qty is null then return new; end if;                 -- not tracked: nothing to do
  if v_qty < new.qty then
    raise exception 'INSUFFICIENT_STOCK' using detail = new.product_id;   -- rolls the whole order back
  end if;
  update public.products set stock_qty = v_qty - new.qty where id = new.product_id;
  insert into public.stock_log (product_id, change, qty_after, reason, order_id, by_user)
  values (new.product_id, -new.qty, v_qty - new.qty, 'order', new.order_id, auth.uid());
  return new;
end $$;
drop trigger if exists order_item_stock on public.order_items;
create trigger order_item_stock
  after insert on public.order_items
  for each row execute function public.trg_order_item_stock();

-- ---------- cancelling gives it back (re-opening takes it again) ----------
create or replace function public.trg_order_stock_restore()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_new int;
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    -- give back exactly what this order took (orders placed before stock tracking took nothing)
    for r in
      select product_id, -sum(change)::int as net
      from public.stock_log
      where order_id = new.id and reason in ('order','cancel')
      group by product_id
      having -sum(change) > 0
    loop
      update public.products set stock_qty = stock_qty + r.net
       where id = r.product_id and stock_qty is not null
       returning stock_qty into v_new;
      if found then
        insert into public.stock_log (product_id, change, qty_after, reason, order_id, by_user)
        values (r.product_id, r.net, v_new, 'cancel', new.id, auth.uid());
      end if;
    end loop;
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    for r in
      select i.product_id, sum(i.qty)::int as q
      from public.order_items i
      where i.order_id = new.id and i.product_id is not null
        and exists (select 1 from public.stock_log l where l.order_id = new.id and l.product_id = i.product_id)
      group by i.product_id
    loop
      update public.products set stock_qty = greatest(stock_qty - r.q, 0)
       where id = r.product_id and stock_qty is not null
       returning stock_qty into v_new;
      if found then
        insert into public.stock_log (product_id, change, qty_after, reason, order_id, by_user)
        values (r.product_id, -r.q, v_new, 'order', new.id, auth.uid());
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists order_stock_restore on public.orders;
create trigger order_stock_restore
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.trg_order_stock_restore();

-- ---------- staff: add stock / set exact stock ----------
--   admin_adjust_stock('607CF02001', p_add => 24)   -> +24 units
--   admin_adjust_stock('607CF02001', p_set => 100)  -> exactly 100 units
create or replace function public.admin_adjust_stock(
  p_product_id text, p_add int default null, p_set int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old int; v_new int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if (p_add is null) = (p_set is null) then raise exception 'INVALID_STOCK'; end if;

  select stock_qty into v_old from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if p_set is not null then
    if p_set < 0 or p_set > 1000000 then raise exception 'INVALID_STOCK'; end if;
    v_new := p_set;
  else
    if abs(p_add) > 1000000 then raise exception 'INVALID_STOCK'; end if;
    v_new := greatest(coalesce(v_old, 0) + p_add, 0);
  end if;

  update public.products set stock_qty = v_new where id = p_product_id;
  insert into public.stock_log (product_id, change, qty_after, reason, by_user)
  values (p_product_id, v_new - coalesce(v_old, 0), v_new,
          case when p_set is not null then 'set' else 'restock' end, auth.uid());

  return (select jsonb_build_object('id', id, 'stock_qty', stock_qty, 'stock', stock)
          from public.products where id = p_product_id);
end $$;

revoke execute on function public.admin_adjust_stock(text, int, int) from public, anon;
grant  execute on function public.admin_adjust_stock(text, int, int) to authenticated;

-- ---------- quick check (should show your products; stock_qty is empty until you add stock) ----------
select id, name, stock, stock_qty, active from public.products order by name limit 10;
