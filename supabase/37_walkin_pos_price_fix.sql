-- ============================================================
-- MAZI — fix "structure of query does not match function result type"
-- on Walk-in / POS (Complete sale & Create quotation).
-- Run AFTER 36_walkin_pos.sql. Safe to re-run.
--
-- Cause: 09_sync_products.sql moved products.price from int to
-- numeric(10,2) so decimal supplier prices wouldn't get rounded off.
-- pos_line_items() (36_walkin_pos.sql) still declares its `price`
-- output column as int. A plain INSERT tolerates that mismatch by
-- silently rounding (that's why the normal online checkout still
-- works), but `return query select ...` inside a plpgsql function
-- does not auto-cast — it requires the column types to already
-- match, so every walk-in sale / quotation fails with that error.
--
-- Fix: change pos_line_items' declared `price` column to numeric,
-- matching products.price. Nothing else needs to change — the later
-- inserts into order_items.price / quotation_items.price (still int)
-- round the same way the online checkout already does today.
-- ============================================================

drop function if exists public.pos_line_items(jsonb);

create or replace function public.pos_line_items(p_items jsonb)
returns table (product_id text, name text, pack text, unit text, price numeric, qty int)
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
  select p.id, p.name, p.pack, p.unit, p.price::numeric, l.qty::int
  from (select e->>'product_id' as pid, sum((e->>'qty')::int)::int as qty
        from jsonb_array_elements(p_items) e group by 1) l
  join public.products p on p.id = l.pid
  order by p.id;
end $$;

notify pgrst, 'reload schema';

-- ---------- quick check ----------
select 'walkin pos price fix applied' as status;
