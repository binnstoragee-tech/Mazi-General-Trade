-- ============================================================
-- MAZI — WALK-IN POS (quotations + walk-in orders from /admin)
-- Run AFTER 01_schema.sql, 02_seed.sql and 08_stock.sql.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- What it adds
--   * orders.order_type ('online' | 'walkin') + orders.created_by (staff)
--   * payment_slip_path / customer_mobile no longer required for walk-in
--     orders (a check constraint still requires a slip for 'online' orders)
--   * quotations + quotation_items  — a "quotation only" record that does
--     NOT touch stock. Staff can later convert it into a real walk-in order.
--   * pos_counters  — separate MWyyyy#### / QTyyyy#### numbering
--   * admin_create_walkin_order(payload)  — staff-only, creates a walk-in
--     order and (via the existing 08_stock.sql trigger) takes the stock off
--     immediately, same as an online order.
--   * admin_create_quotation(payload)     — staff-only, no stock impact.
--   * admin_convert_quotation(p_id)       — turns an open quotation into a
--     real walk-in order (stock is taken off at THIS point).
--   * admin_void_quotation(p_id)          — cancels an open quotation.
--
-- payload shape (same for walkin order + quotation) =
--   { items:[{product_id, qty}], customer:{name, mobile}, note:'...' }
-- Money is always computed server-side from products.price (the shop's
-- standard/business price — a walk-in customer is served in person).
-- ============================================================

-- ---------- orders: allow a walk-in channel ----------
alter table public.orders
  add column if not exists order_type text not null default 'online' check (order_type in ('online','walkin')),
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists orders_type_idx on public.orders(order_type, placed_at desc);

-- online orders still need a payment slip; walk-in ones don't
alter table public.orders alter column payment_slip_path drop not null;
alter table public.orders alter column customer_mobile drop not null;
alter table public.orders drop constraint if exists orders_online_slip_required;
alter table public.orders add constraint orders_online_slip_required
  check (order_type <> 'online' or payment_slip_path is not null);

-- ---------- quotations ----------
create table if not exists public.quotations (
  id                 text primary key,                      -- QT20260001
  created_by         uuid references public.profiles(id) on delete set null,
  status             text not null default 'open' check (status in ('open','converted','void')),
  customer_name      text not null,
  customer_mobile    text,
  subtotal           numeric(12,2) not null,
  gst                numeric(12,2) not null,
  total              numeric(12,2) not null,
  note               text,
  converted_order_id text references public.orders(id),
  created_at         timestamptz not null default now()
);
create index if not exists quotations_status_idx on public.quotations(status, created_at desc);

create table if not exists public.quotation_items (
  id            bigint generated always as identity primary key,
  quotation_id  text not null references public.quotations(id) on delete cascade,
  product_id    text references public.products(id) on delete set null,
  name          text not null,          -- snapshot at quote time
  pack          text,
  unit          text,
  price         int  not null,          -- snapshot price (MVR)
  qty           int  not null check (qty > 0)
);
create index if not exists quotation_items_q_idx on public.quotation_items(quotation_id);

create table if not exists public.pos_counters (
  year     int  not null,
  kind     text not null check (kind in ('walkin','quotation')),
  last_no  int  not null default 0,
  primary key (year, kind)
);

alter table public.quotations     enable row level security;
alter table public.quotation_items enable row level security;
alter table public.pos_counters   enable row level security;

revoke all on public.quotations, public.quotation_items, public.pos_counters from anon, authenticated;
grant select on public.quotations, public.quotation_items to authenticated;
-- pos_counters: no policies = nobody can touch it directly (only the RPCs below do, as owner)

drop policy if exists quotations_admin_select on public.quotations;
create policy quotations_admin_select on public.quotations for select using (public.is_admin());
drop policy if exists quotation_items_admin_select on public.quotation_items;
create policy quotation_items_admin_select on public.quotation_items for select
  using (exists (select 1 from public.quotations q where q.id = quotation_id and public.is_admin()));

-- ------------------------------------------------------------
-- Helper: validate + expand a POS items array into priced lines.
-- Reused by both admin_create_walkin_order and admin_create_quotation.
-- ------------------------------------------------------------
create or replace function public.pos_line_items(p_items jsonb)
returns table (product_id text, name text, pack text, unit text, price int, qty int)
language plpgsql stable security definer set search_path = public as $$
declare v_missing text[];
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 200 then
    raise exception 'EMPTY_CART';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where coalesce(e->>'product_id','') = ''
                or case when e->>'qty' ~ '^[0-9]{1,4}$' then (e->>'qty')::int else 0 end < 1) then
    raise exception 'INVALID_ITEMS';
  end if;

  select array_agg(distinct e->>'product_id') into v_missing
  from jsonb_array_elements(p_items) e
  where not exists (select 1 from public.products p where p.id = e->>'product_id' and p.active);
  if v_missing is not null then
    raise exception 'PRODUCT_NOT_FOUND' using detail = array_to_string(v_missing, ',');
  end if;

  return query
  select p.id, p.name, p.pack, p.unit, p.price, l.qty::int
  from (select e->>'product_id' as pid, sum((e->>'qty')::int)::int as qty
        from jsonb_array_elements(p_items) e group by 1) l
  join public.products p on p.id = l.pid
  order by p.id;
end $$;

-- ------------------------------------------------------------
-- Quotation JSON shape (mirrors order_json in 01_schema.sql)
-- ------------------------------------------------------------
create or replace function public.quotation_json(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'status', q.status, 'created_at', q.created_at,
    'customer', jsonb_build_object('name', q.customer_name, 'mobile', q.customer_mobile),
    'subtotal', q.subtotal, 'gst', q.gst, 'total', q.total, 'note', q.note,
    'converted_order_id', q.converted_order_id,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'product_id', i.product_id, 'name', i.name, 'pack', i.pack,
                'unit', i.unit, 'price', i.price, 'qty', i.qty) order by i.id), '[]'::jsonb)
              from public.quotation_items i where i.quotation_id = q.id))
  from public.quotations q where q.id = p_id;
$$;

-- ------------------------------------------------------------
-- admin_create_walkin_order — confirmed sale, takes stock off immediately
-- (via the order_items trigger from 08_stock.sql; insufficient stock rolls
-- the whole thing back with INSUFFICIENT_STOCK, same as online orders).
-- ------------------------------------------------------------
create or replace function public.admin_create_walkin_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name      text := btrim(coalesce(payload->'customer'->>'name',''));
  v_mobile    text := nullif(btrim(coalesce(payload->'customer'->>'mobile','')),'');
  v_note      text := nullif(btrim(coalesce(payload->>'note','')),'');
  v_gst_rate  numeric := coalesce((public.cfg('gst_rate'))::numeric, 0.08);
  v_year      int := extract(year from (now() at time zone 'Indian/Maldives'))::int;
  v_n         int;
  v_id        text;
  v_subtotal  numeric;
  v_gst       numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(v_name) = 0 then v_name := 'Walk-in customer'; end if;

  select coalesce(sum(li.price * li.qty), 0) into v_subtotal
  from public.pos_line_items(payload->'items') li;
  v_gst := round(v_subtotal - v_subtotal / (1 + v_gst_rate), 2);

  insert into public.pos_counters (year, kind, last_no) values (v_year, 'walkin', 1)
  on conflict (year, kind) do update set last_no = public.pos_counters.last_no + 1
  returning last_no into v_n;
  v_id := 'MW' || v_year || lpad(v_n::text, 4, '0');

  insert into public.orders (id, user_id, order_type, created_by, status, method, location,
                              customer_name, customer_mobile, currency,
                              subtotal, gst, delivery_fee, total, payment_slip_path, admin_note)
  values (v_id, null, 'walkin', auth.uid(), 'placed', 'pickup', '{}'::jsonb,
          v_name, v_mobile, 'MVR', v_subtotal, v_gst, 0, v_subtotal, null, v_note);

  insert into public.order_items (order_id, product_id, name, pack, unit, price, qty)
  select v_id, li.product_id, li.name, li.pack, li.unit, li.price, li.qty
  from public.pos_line_items(payload->'items') li;
  -- ^ the order_item_stock trigger (08_stock.sql) fires here and takes the
  --   stock off; it raises INSUFFICIENT_STOCK and rolls everything back if
  --   there isn't enough.

  return public.order_json(v_id);
end $$;

-- ------------------------------------------------------------
-- admin_create_quotation — no stock impact at all.
-- ------------------------------------------------------------
create or replace function public.admin_create_quotation(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name      text := btrim(coalesce(payload->'customer'->>'name',''));
  v_mobile    text := nullif(btrim(coalesce(payload->'customer'->>'mobile','')),'');
  v_note      text := nullif(btrim(coalesce(payload->>'note','')),'');
  v_gst_rate  numeric := coalesce((public.cfg('gst_rate'))::numeric, 0.08);
  v_year      int := extract(year from (now() at time zone 'Indian/Maldives'))::int;
  v_n         int;
  v_id        text;
  v_subtotal  numeric;
  v_gst       numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(v_name) = 0 then v_name := 'Walk-in customer'; end if;

  select coalesce(sum(li.price * li.qty), 0) into v_subtotal
  from public.pos_line_items(payload->'items') li;
  v_gst := round(v_subtotal - v_subtotal / (1 + v_gst_rate), 2);

  insert into public.pos_counters (year, kind, last_no) values (v_year, 'quotation', 1)
  on conflict (year, kind) do update set last_no = public.pos_counters.last_no + 1
  returning last_no into v_n;
  v_id := 'QT' || v_year || lpad(v_n::text, 4, '0');

  insert into public.quotations (id, created_by, status, customer_name, customer_mobile,
                                  subtotal, gst, total, note)
  values (v_id, auth.uid(), 'open', v_name, v_mobile, v_subtotal, v_gst, v_subtotal, v_note);

  insert into public.quotation_items (quotation_id, product_id, name, pack, unit, price, qty)
  select v_id, li.product_id, li.name, li.pack, li.unit, li.price, li.qty
  from public.pos_line_items(payload->'items') li;

  return public.quotation_json(v_id);
end $$;

-- ------------------------------------------------------------
-- admin_convert_quotation — turns an OPEN quotation into a real walk-in
-- order (stock only moves now, at conversion time).
-- ------------------------------------------------------------
create or replace function public.admin_convert_quotation(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_q       public.quotations;
  v_items   jsonb;
  v_new_id  text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_q from public.quotations where id = p_id for update;
  if not found then raise exception 'QUOTATION_NOT_FOUND'; end if;
  if v_q.status <> 'open' then raise exception 'QUOTATION_NOT_OPEN'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty)), '[]'::jsonb)
    into v_items
  from public.quotation_items where quotation_id = p_id;

  v_new_id := public.admin_create_walkin_order(jsonb_build_object(
    'items', v_items,
    'customer', jsonb_build_object('name', v_q.customer_name, 'mobile', v_q.customer_mobile),
    'note', trim(coalesce(v_q.note,'') || ' (from quotation ' || p_id || ')')
  ))->>'id';

  update public.quotations set status = 'converted', converted_order_id = v_new_id where id = p_id;

  return public.order_json(v_new_id);
end $$;

-- ------------------------------------------------------------
-- admin_void_quotation — cancel an open quotation (no stock was ever moved).
-- ------------------------------------------------------------
create or replace function public.admin_void_quotation(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.quotations set status = 'void' where id = p_id and status = 'open';
  if not found then raise exception 'QUOTATION_NOT_FOUND'; end if;
  return public.quotation_json(p_id);
end $$;

revoke execute on function
  public.admin_create_walkin_order(jsonb), public.admin_create_quotation(jsonb),
  public.admin_convert_quotation(text), public.admin_void_quotation(text)
  from public, anon;
grant execute on function public.admin_create_walkin_order(jsonb) to authenticated;
grant execute on function public.admin_create_quotation(jsonb)    to authenticated;
grant execute on function public.admin_convert_quotation(text)    to authenticated;
grant execute on function public.admin_void_quotation(text)       to authenticated;

-- Tell PostgREST to pick up the new functions right away (it caches the
-- schema and normally only refreshes every few minutes). Without this you
-- can get "Could not find the function ... in the schema cache" for a
-- while even though the SQL above ran successfully.
notify pgrst, 'reload schema';

-- ---------- quick check ----------
select 'walkin pos ready' as status;
