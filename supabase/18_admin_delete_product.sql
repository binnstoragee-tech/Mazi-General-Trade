-- ============================================================
-- MAZI — Delete product (Stock page → Edit product → Delete)
-- Run once in Supabase → SQL Editor (same as your earlier
-- numbered migrations). Requires 01_schema.sql already run.
--
-- Safe to delete: order_items.product_id is ON DELETE SET NULL
-- (each order item already snapshots its own name/pack/unit/price,
-- so past orders keep showing correctly — they just lose the link
-- to this product). stock_log and product_edit_log for this
-- product are ON DELETE CASCADE, so their history goes with it.
--
-- If you'd rather keep a product out of the shop WITHOUT losing
-- its history, use the "Visible to customers" toggle instead —
-- this action can't be undone.
-- ============================================================

create or replace function public.admin_delete_product(p_product_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product % not found', p_product_id;
  end if;

  delete from public.products where id = p_product_id;
end;
$$;

grant execute on function public.admin_delete_product(text) to authenticated;
