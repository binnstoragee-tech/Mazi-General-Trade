-- ============================================================
-- MAZI — let staff update a product's image from /admin too
-- Run once in Supabase → SQL Editor (paste all → Run). Safe to re-run.
--
-- Adds an image_url parameter to admin_update_product() (existing
-- calls keep working — the new parameter defaults to "no change").
-- ============================================================

create or replace function public.admin_update_product(
  p_product_id text,
  p_name       text,
  p_pack       text,
  p_unit       text,
  p_price      numeric,
  p_icon       text,
  p_active     boolean,
  p_image_url  text default null
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.products;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

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
  if p_image_url is not null and p_image_url is distinct from v_row.image_url then
    insert into public.product_edit_log(product_id, field, old_value, new_value, changed_by)
    values (p_product_id, 'image_url', v_row.image_url, p_image_url, auth.uid());
  end if;

  update public.products set
    name      = coalesce(p_name, name),
    pack      = p_pack,
    unit      = p_unit,
    price     = coalesce(p_price, price),
    icon      = p_icon,
    active    = coalesce(p_active, active),
    image_url = coalesce(p_image_url, image_url)
  where id = p_product_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_update_product(text, text, text, text, numeric, text, boolean, text) to authenticated;
