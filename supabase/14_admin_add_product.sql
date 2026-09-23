-- ============================================================
-- MAZI — Add new products from the Admin dashboard
-- Run once in Supabase → SQL Editor (paste all → Run).
-- Safe to re-run.
--
-- Lets staff CREATE a brand-new product (not just edit an
-- existing one) from /admin, and logs it in product_edit_log
-- exactly like admin_update_product does.
-- ============================================================

create or replace function public.admin_add_product(
  p_product_id text,
  p_name       text,
  p_category_id text,
  p_pack       text,
  p_unit       text,
  p_price      numeric,
  p_icon       text default null,
  p_image_url  text default null,
  p_active     boolean default true
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_product_id is null or btrim(p_product_id) = '' then
    raise exception 'Product ID is required';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Product name is required';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Unknown category: %', p_category_id;
  end if;
  if exists (select 1 from public.products where id = p_product_id) then
    raise exception 'A product with ID % already exists', p_product_id;
  end if;

  insert into public.products (id, name, category_id, icon, pack, unit, price, stock, image_url, active)
  values (p_product_id, p_name, p_category_id, p_icon, p_pack, p_unit, p_price, 'in',
          coalesce(p_image_url, 'img/household&cleaning/' || p_product_id || '.png'),
          coalesce(p_active, true))
  returning * into v_row;

  insert into public.product_edit_log (product_id, field, old_value, new_value, changed_by)
  values (p_product_id, 'created', null, p_name, auth.uid());

  return v_row;
end;
$$;

grant execute on function public.admin_add_product(text, text, text, text, text, numeric, text, text, boolean) to authenticated;
