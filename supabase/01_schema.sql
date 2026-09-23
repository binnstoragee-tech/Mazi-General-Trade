-- ============================================================
-- MAZI General Trade — Supabase backend (schema + security + API functions)
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Then run 02_seed.sql.
-- Safe to re-run: uses "if not exists" / "create or replace".
--
-- API surface created by this file (called from the site via supabase-js):
--   Tables (RLS protected): profiles, categories, products, orders, order_items, app_config
--   RPC: list_products, create_order, cancel_order, delete_my_account,
--        admin_set_order_status, admin_set_business_verified
--   Storage: private bucket "payment-slips"
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  mobile                 text unique,
  name                   text,
  email                  text,
  account_type           text not null default 'residence' check (account_type in ('business','residence')),
  business_type          text check (business_type is null or business_type in
                           ('Retail Shop','Wholesale / Trading','Restaurant / Café','Guesthouse / Hotel','Other')),
  business_name          text,
  gst_tin                text,
  business_verified      boolean not null default false,   -- set by staff only
  atoll                  text,
  city                   text,
  onboarded              boolean not null default false,
  notifications_enabled  boolean not null default true,
  is_admin               boolean not null default false,   -- set by owner only (dashboard)
  created_at             timestamptz not null default now()
);

create table if not exists public.categories (
  id          text primary key,
  name        text not null,
  sort_order  int  not null default 0
);

create table if not exists public.products (
  id               text primary key,                       -- e.g. MZ001
  name             text not null,
  category_id      text not null references public.categories(id),
  icon             text,
  pack             text,
  unit             text,
  price            int  not null check (price >= 0),       -- MVR, GST included (Business / standard price)
  residence_price  int  check (residence_price is null or residence_price >= 0), -- NULL = same as price
  stock            text not null default 'in' check (stock in ('in','low','out')),
  image_url        text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);

create table if not exists public.app_config (
  key    text primary key,
  value  jsonb not null
);

create table if not exists public.order_counters (
  year     int primary key,
  last_no  int not null default 0
);

create table if not exists public.orders (
  id                 text primary key,                     -- MZ20260001
  user_id            uuid references public.profiles(id) on delete set null,
  status             text not null default 'placed'
                       check (status in ('placed','processing','delivery','delivered','cancelled')),
  method             text not null check (method in ('pickup','delivery','boat')),
  location           jsonb not null default '{}'::jsonb,
  customer_name      text not null,
  customer_mobile    text not null,
  currency           text not null default 'MVR' check (currency in ('MVR','USD')),  -- display preference only
  subtotal           numeric(12,2) not null,               -- always MVR
  gst                numeric(12,2) not null,
  delivery_fee       numeric(12,2),                        -- NULL = "to be confirmed" by staff
  total              numeric(12,2) not null,
  payment_slip_path  text not null,
  refund_status      text not null default 'none' check (refund_status in ('none','pending','refunded')),
  admin_note         text,
  placed_at          timestamptz not null default now(),
  status_updated_at  timestamptz not null default now(),
  cancelled_at       timestamptz
);
create index if not exists orders_user_idx on public.orders(user_id, placed_at desc);
create index if not exists orders_status_idx on public.orders(status, placed_at desc);

create table if not exists public.order_items (
  id          bigint generated always as identity primary key,
  order_id    text not null references public.orders(id) on delete cascade,
  product_id  text references public.products(id) on delete set null,
  name        text not null,          -- snapshot at purchase time
  pack        text,
  unit        text,
  price       int  not null,          -- snapshot price actually charged (MVR)
  qty         int  not null check (qty > 0)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ------------------------------------------------------------
-- 2. Helper functions
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_business_pricing()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select account_type = 'business' and business_verified
                     from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.cfg(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = p_key;
$$;

-- Auto-create a profile whenever someone signs up. Email/password signups may
-- provide a mobile contact in raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  signup_mobile text;
begin
  signup_mobile := case
    when new.phone is not null and new.phone <> '' then
      case when left(new.phone,1) = '+' then new.phone else '+' || new.phone end
    when coalesce(new.raw_user_meta_data->>'mobile', '') <> '' then
      case when left(new.raw_user_meta_data->>'mobile',1) = '+'
           then new.raw_user_meta_data->>'mobile'
           else '+' || new.raw_user_meta_data->>'mobile' end
    else null
  end;

  -- A duplicate mobile must not abort the auth.users insert with Supabase's
  -- generic "Database error saving new user" message. Keep the new profile,
  -- but leave mobile null so the unique profiles.mobile constraint remains
  -- valid; the auth metadata still retains the submitted contact number.
  if signup_mobile is not null and exists (
    select 1 from public.profiles where mobile = signup_mobile
  ) then
    signup_mobile := null;
  end if;

  begin
    insert into public.profiles (id, email, mobile)
    values (new.id, new.email, signup_mobile)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- Keep signup successful if an older profile already owns the mobile.
    insert into public.profiles (id, email, mobile)
    values (new.id, new.email, null)
    on conflict (id) do nothing;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Order JSON shape returned by the API (internal helper)
create or replace function public.order_json(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'placed_at', o.placed_at,
    'method', o.method, 'location', o.location,
    'customer', jsonb_build_object('name', o.customer_name, 'mobile', o.customer_mobile),
    'currency', o.currency, 'subtotal', o.subtotal, 'gst', o.gst,
    'delivery_fee', o.delivery_fee, 'total', o.total,
    'refund_status', o.refund_status, 'cancelled_at', o.cancelled_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'product_id', i.product_id, 'name', i.name, 'pack', i.pack,
                'unit', i.unit, 'price', i.price, 'qty', i.qty) order by i.id), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id))
  from public.orders o where o.id = p_id;
$$;

-- ------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.app_config     enable row level security;
alter table public.order_counters enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;

-- profiles: you see/edit only your own; admins can read all
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- catalog + config: public read, admin write
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (active or public.is_admin());
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists config_read on public.app_config;
create policy config_read on public.app_config for select using (true);
drop policy if exists config_admin on public.app_config;
create policy config_admin on public.app_config for all using (public.is_admin()) with check (public.is_admin());

-- orders / items: read your own (admins read all). NO direct insert/update/delete —
-- everything goes through the functions below so prices can't be forged.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
-- order_counters: no policies = nobody can touch it directly

-- Table privileges (defense in depth on top of RLS)
revoke all on public.orders, public.order_items, public.order_counters from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

-- Catalog + config: everyone can read; writes are limited to admins by the RLS policies above.
-- (Explicit grants so this works whether or not "Automatically expose new tables" is on.)
revoke all on public.categories, public.products, public.app_config from anon, authenticated;
grant select on public.categories, public.products, public.app_config to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.app_config to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- users may edit ONLY these columns (not is_admin / business_verified)
grant update (name, email, mobile, account_type, business_type, business_name, gst_tin,
              atoll, city, onboarded, notifications_enabled) on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 4. Public catalog RPC (returns the price for the caller's account type)
-- ------------------------------------------------------------
create or replace function public.list_products(
  p_cat text default null, p_q text default null,
  p_limit int default 200, p_offset int default 0)
returns table (id text, name text, category text, icon text, pack text, unit text,
               price int, stock text, image_url text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.category_id, p.icon, p.pack, p.unit,
         case when public.is_business_pricing() then p.price
              else coalesce(p.residence_price, p.price) end,
         p.stock, p.image_url
  from public.products p
  where p.active
    and (p_cat is null or p_cat = 'all' or p.category_id = p_cat)
    and (p_q is null or btrim(p_q) = ''
         or position(lower(btrim(p_q)) in lower(p.name || ' ' || coalesce(p.unit,''))) > 0)
  order by p.id
  limit least(greatest(p_limit,1), 500) offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- 5. create_order — the ONLY way to make an order. Server decides all money.
-- payload = {
--   items:[{product_id, qty}], currency:'MVR'|'USD',
--   customer:{name, mobile}, method:'pickup'|'delivery'|'boat',
--   location:{...}, terms_accepted:true, payment_slip_path:'<uid>/<file>'
-- }
-- ------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_method    text := payload->>'method';
  v_currency  text := coalesce(payload->>'currency','MVR');
  v_name      text := btrim(coalesce(payload->'customer'->>'name',''));
  v_mobile    text := btrim(coalesce(payload->'customer'->>'mobile',''));
  v_loc       jsonb := coalesce(payload->'location','{}'::jsonb);
  v_slip      text := payload->>'payment_slip_path';
  v_business  boolean;
  v_gst_rate  numeric := coalesce((public.cfg('gst_rate'))::numeric, 0.08);
  v_male      jsonb := coalesce(public.cfg('male_islands'), '["Male''","Hulhumale''"]'::jsonb);
  v_missing   text[];
  v_out       text[];
  v_subtotal  numeric;
  v_fee       numeric;
  v_gst       numeric;
  v_total     numeric;
  v_year      int := extract(year from (now() at time zone 'Indian/Maldives'))::int;
  v_n         int;
  v_id        text;
  v_ok        boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- basic validation (mirrors the checkout form rules)
  if coalesce(payload->>'terms_accepted','') <> 'true' then raise exception 'TERMS_REQUIRED'; end if;
  if v_currency not in ('MVR','USD') then raise exception 'INVALID_CURRENCY'; end if;
  if v_method is null or v_method not in ('pickup','delivery','boat') then raise exception 'INVALID_METHOD'; end if;
  if length(v_name) < 2 or v_mobile !~ '^[0-9+\-\s]{6,}$' then raise exception 'INVALID_CUSTOMER'; end if;
  if length(v_loc::text) > 4000 then raise exception 'INVALID_LOCATION'; end if;

  -- items
  if jsonb_typeof(payload->'items') is distinct from 'array'
     or jsonb_array_length(payload->'items') = 0
     or jsonb_array_length(payload->'items') > 100 then
    raise exception 'EMPTY_CART';
  end if;
  if exists (select 1 from jsonb_array_elements(payload->'items') e
             where coalesce(e->>'product_id','') = ''
                or case when e->>'qty' ~ '^[0-9]{1,3}$' then (e->>'qty')::int else 0 end < 1) then
    raise exception 'INVALID_ITEMS';
  end if;

  -- location per delivery method
  if v_method = 'pickup' then
    v_ok := length(btrim(coalesce(v_loc->>'day',''))) > 0;
  elsif v_method = 'delivery' then
    v_ok := length(btrim(coalesce(v_loc->>'island',''))) > 0
        and length(btrim(coalesce(v_loc->>'house',''))) >= 2;
  else -- boat
    v_ok := length(btrim(coalesce(v_loc->>'boatName','')))        >= 2
        and length(btrim(coalesce(v_loc->>'boatContact','')))     >= 6
        and length(btrim(coalesce(v_loc->>'boatDeparture','')))   >= 1
        and length(btrim(coalesce(v_loc->>'customerName','')))    >= 2
        and length(btrim(coalesce(v_loc->>'customerContact','')))  >= 6
        and length(btrim(coalesce(v_loc->>'address','')))         >= 5
        and length(btrim(coalesce(v_loc->>'islandName','')))      >= 2
        and length(btrim(coalesce(v_loc->>'islandCode','')))      >= 1;
  end if;
  if not v_ok then raise exception 'INVALID_LOCATION'; end if;

  -- payment slip must be a file THIS user uploaded to the private bucket
  if coalesce(v_slip,'') = '' or split_part(v_slip,'/',1) <> v_uid::text
     or not exists (select 1 from storage.objects
                    where bucket_id = 'payment-slips' and name = v_slip) then
    raise exception 'SLIP_REQUIRED';
  end if;

  -- simple abuse guard
  if (select count(*) from public.orders
      where user_id = v_uid and placed_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  -- products: must exist, be active and not out of stock
  select array_agg(distinct e->>'product_id') into v_missing
  from jsonb_array_elements(payload->'items') e
  where not exists (select 1 from public.products p where p.id = e->>'product_id' and p.active);
  if v_missing is not null then
    raise exception 'PRODUCT_NOT_FOUND' using detail = array_to_string(v_missing, ',');
  end if;

  select array_agg(p.id order by p.id) into v_out
  from public.products p
  where p.stock = 'out'
    and p.id in (select e->>'product_id' from jsonb_array_elements(payload->'items') e);
  if v_out is not null then
    raise exception 'OUT_OF_STOCK' using detail = array_to_string(v_out, ',');
  end if;

  -- money (server-side only; anything the client sent is ignored)
  v_business := public.is_business_pricing();
  select sum(l.qty * case when v_business then p.price else coalesce(p.residence_price, p.price) end)
    into v_subtotal
  from (select e->>'product_id' as pid, sum((e->>'qty')::int) as qty
        from jsonb_array_elements(payload->'items') e group by 1) l
  join public.products p on p.id = l.pid;

  if v_method = 'pickup' then
    v_fee := 0;
  elsif v_method = 'delivery' and v_male ? coalesce(v_loc->>'island','') then
    v_fee := 0;                       -- Male' / Hulhumale' delivery is complimentary
  else
    v_fee := null;                    -- islands / boat: staff confirms the fee later
  end if;
  v_gst   := round(v_subtotal - v_subtotal / (1 + v_gst_rate), 2);
  v_total := v_subtotal + coalesce(v_fee, 0);

  -- order number: MZ + year + 4-digit sequence (safe under concurrency)
  insert into public.order_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = public.order_counters.last_no + 1
  returning last_no into v_n;
  v_id := 'MZ' || v_year || lpad(v_n::text, 4, '0');

  insert into public.orders (id, user_id, method, location, customer_name, customer_mobile,
                             currency, subtotal, gst, delivery_fee, total, payment_slip_path)
  values (v_id, v_uid, v_method, v_loc, v_name, v_mobile,
          v_currency, v_subtotal, v_gst, v_fee, v_total, v_slip);

  insert into public.order_items (order_id, product_id, name, pack, unit, price, qty)
  select v_id, p.id, p.name, p.pack, p.unit,
         case when v_business then p.price else coalesce(p.residence_price, p.price) end,
         l.qty
  from (select e->>'product_id' as pid, sum((e->>'qty')::int)::int as qty
        from jsonb_array_elements(payload->'items') e group by 1) l
  join public.products p on p.id = l.pid
  order by p.id;

  return public.order_json(v_id);
end $$;

-- ------------------------------------------------------------
-- 6. Customer actions
-- ------------------------------------------------------------
-- Cancel: only while status = 'placed' (same rule as the UI). Refund is manual (Terms §4).
create or replace function public.cancel_order(p_order_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v.status <> 'placed' then raise exception 'CANNOT_CANCEL'; end if;
  update public.orders
     set status = 'cancelled', cancelled_at = now(), status_updated_at = now(),
         refund_status = 'pending'          -- a payment slip is always uploaded, so staff must review the refund
   where id = p_order_id;
  return public.order_json(p_order_id);
end $$;

-- Delete account: anonymises order history (kept for accounting) and removes the login.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.orders
     set customer_name = 'Deleted account', customer_mobile = '', location = '{}'::jsonb, user_id = null
   where user_id = v_uid;
  delete from auth.users where id = v_uid;   -- cascades to profiles
end $$;

-- ------------------------------------------------------------
-- 7. Staff actions (only profiles.is_admin = true)
-- ------------------------------------------------------------
create or replace function public.admin_set_order_status(
  p_order_id text, p_status text,
  p_delivery_fee numeric default null, p_note text default null, p_refund_status text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('placed','processing','delivery','delivered','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_refund_status is not null and p_refund_status not in ('none','pending','refunded') then
    raise exception 'INVALID_REFUND_STATUS';
  end if;
  update public.orders o
     set status = p_status,
         status_updated_at = now(),
         cancelled_at = case when p_status = 'cancelled' then coalesce(o.cancelled_at, now()) else o.cancelled_at end,
         delivery_fee = coalesce(p_delivery_fee, o.delivery_fee),
         total = o.subtotal + coalesce(p_delivery_fee, o.delivery_fee, 0),
         admin_note = coalesce(p_note, o.admin_note),
         refund_status = coalesce(p_refund_status, o.refund_status)
   where o.id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return public.order_json(p_order_id);
end $$;

create or replace function public.admin_set_business_verified(p_user uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.profiles set business_verified = p_verified where id = p_user;
end $$;

-- Who may call what
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.list_products(text, text, int, int) to anon, authenticated;
grant execute on function public.create_order(jsonb)                 to authenticated;
grant execute on function public.cancel_order(text)                  to authenticated;
grant execute on function public.delete_my_account()                 to authenticated;
grant execute on function public.admin_set_order_status(text, text, numeric, text, text) to authenticated;
grant execute on function public.admin_set_business_verified(uuid, boolean)              to authenticated;
-- is_admin / is_business_pricing / cfg must stay callable by anon/authenticated
-- because RLS policies and list_products() use them:
grant execute on function public.is_admin(), public.is_business_pricing(), public.cfg(text)
      to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Payment slip storage (private bucket, 5 MB, JPG/PNG/PDF)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 5242880,
        array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

-- upload only into your own folder:  <user-id>/<filename>
drop policy if exists "slips upload own" on storage.objects;
create policy "slips upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);

-- read: owner or staff.  No update/delete for customers (can't swap a slip after ordering).
drop policy if exists "slips read own or admin" on storage.objects;
create policy "slips read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ------------------------------------------------------------
-- 9. Realtime: let the site get live order-status updates (RLS still applies)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
