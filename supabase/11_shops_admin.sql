-- =====================================================================
-- MAZI — 11_shops_admin.sql
-- Lets staff (profiles.is_admin = true) see and approve "My Accounts"
-- (public.shops) from the admin dashboard. Run after 10_shops.sql.
-- =====================================================================

create or replace function public.shops_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- List accounts with the owner's details (staff only)
create or replace function public.admin_list_shops(p_status text default null)
returns table (
  id uuid, user_id uuid, account_type text, name text, business_type text,
  gst_tin text, gst_exempt boolean, atoll text, city text, status text,
  created_at timestamptz, owner_name text, owner_mobile text, owner_email text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.shops_is_admin() then raise exception 'not authorized'; end if;
  return query
    select s.id, s.user_id, s.account_type, s.name, s.business_type,
           s.gst_tin, s.gst_exempt, s.atoll, s.city, s.status, s.created_at,
           nullif(trim(concat_ws(' ', p.name, p.last_name)), ''), p.mobile, p.email
    from public.shops s
    left join public.profiles p on p.id = s.user_id
    where p_status is null or s.status = p_status
    order by s.created_at desc;
end $$;

-- Approve / reject / set back to pending (staff only)
create or replace function public.admin_set_shop_status(p_shop uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.shops_is_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'bad status'; end if;
  update public.shops set status = p_status where id = p_shop;
end $$;

grant execute on function public.shops_is_admin()                 to authenticated;
grant execute on function public.admin_list_shops(text)           to authenticated;
grant execute on function public.admin_set_shop_status(uuid,text) to authenticated;
