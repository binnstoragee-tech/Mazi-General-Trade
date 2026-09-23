-- ============================================================
-- MAZI — Product editing + edit audit log
-- Run once in Supabase → SQL Editor (same way you ran your
-- earlier numbered migrations).
-- Lets staff edit product name / pack / unit / price / icon /
-- visibility from the admin dashboard, and records who changed
-- what and when.
-- ============================================================

create table if not exists public.product_edit_log (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products(id) on delete cascade,
  field       text not null,
  old_value   text,
  new_value   text,
  changed_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists product_edit_log_product_id_idx on public.product_edit_log(product_id);
create index if not exists product_edit_log_created_at_idx on public.product_edit_log(created_at desc);

alter table public.product_edit_log enable row level security;

drop policy if exists "product_edit_log admin read" on public.product_edit_log;
create policy "product_edit_log admin read" on public.product_edit_log
  for select
  using (exists (
    select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin
  ));

-- Row Level Security keeps this table read-only from the client — all
-- writes to it happen inside admin_update_product() below.

create or replace function public.admin_update_product(
  p_product_id text,
  p_name       text,
  p_pack       text,
  p_unit       text,
  p_price      numeric,
  p_icon       text,
  p_active     boolean
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.products;
  v_name text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  -- Staff display name for readability in old_value/new_value is not
  -- stored here — adminListProductEditLog() resolves changed_by → staff
  -- name/email at read time via a join to profiles.

  if p_name is not null and p_name is distinct from v_row.name then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'name', v_row.name, p_name, auth.uid());
  end if;
  if p_pack is distinct from v_row.pack then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'pack', v_row.pack, p_pack, auth.uid());
  end if;
  if p_unit is distinct from v_row.unit then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'unit', v_row.unit, p_unit, auth.uid());
  end if;
  if p_price is not null and p_price is distinct from v_row.price then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'price', v_row.price::text, p_price::text, auth.uid());
  end if;
  if p_icon is distinct from v_row.icon then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'icon', v_row.icon, p_icon, auth.uid());
  end if;
  if p_active is not null and p_active is distinct from v_row.active then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'active', v_row.active::text, p_active::text, auth.uid());
  end if;

  update public.products set
    name   = coalesce(p_name, name),
    pack   = p_pack,
    unit   = p_unit,
    price  = coalesce(p_price, price),
    icon   = p_icon,
    active = coalesce(p_active, active)
  where id = p_product_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_update_product(text, text, text, text, numeric, text, boolean) to authenticated;
