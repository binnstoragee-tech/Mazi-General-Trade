-- ============================================================
-- MAZI — Accounts page is Super Admin only + customer can edit
-- their own business account (needs re-approval after editing)
-- Run in: Supabase Dashboard -> SQL Editor (safe to re-run,
-- after 01_schema.sql, 10_shops.sql, 11_shops_admin.sql, 22_super_admin.sql)
--
--   - admin_list_shops() / admin_set_shop_status() ngayon
--     public.is_super_admin() na lang ang tinitignan, hindi na
--     basta is_admin — kaya "Accounts" (My Accounts approval) ay
--     Super Admin lang, tulad ng Staff Access.
--   - update_my_shop() — bagong function na tumatawag ang
--     customer mismo (my-accounts.html) para i-edit ang sarili
--     niyang business account. Anumang edit ay ibinabalik sa
--     status na 'pending' — kailangan ulit itong aprubahan ng
--     Super Admin, kahit 'approved' na dati.
-- ============================================================

create or replace function public.admin_list_shops(p_status text default null)
returns table (
  id uuid, user_id uuid, account_type text, name text, business_type text,
  gst_tin text, gst_exempt boolean, atoll text, city text, status text,
  created_at timestamptz, owner_name text, owner_mobile text, owner_email text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  return query
    select s.id, s.user_id, s.account_type, s.name, s.business_type,
           s.gst_tin, s.gst_exempt, s.atoll, s.city, s.status, s.created_at,
           nullif(trim(concat_ws(' ', p.name, p.last_name)), ''), p.mobile, p.email
    from public.shops s
    left join public.profiles p on p.id = s.user_id
    where p_status is null or s.status = p_status
    order by s.created_at desc;
end $$;

create or replace function public.admin_set_shop_status(p_shop uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'bad status'; end if;
  update public.shops set status = p_status where id = p_shop;
end $$;

grant execute on function public.admin_list_shops(text)           to authenticated;
grant execute on function public.admin_set_shop_status(uuid,text) to authenticated;

-- Let the owner edit their own business account. Always sends it back to
-- 'pending' so it needs a Super Admin's approval again, whatever its
-- previous status was (including already-'approved').
create or replace function public.update_my_shop(
  p_id uuid, p_name text, p_business_type text, p_gst_tin text,
  p_gst_exempt boolean, p_atoll text, p_city text
)
returns public.shops
language plpgsql security definer set search_path = public as $$
declare v_row public.shops;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.shops
     set name = p_name, business_type = p_business_type, gst_tin = p_gst_tin,
         gst_exempt = p_gst_exempt, atoll = p_atoll, city = p_city,
         status = 'pending'
   where id = p_id and user_id = auth.uid()
   returning * into v_row;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  return v_row;
end;
$$;
grant execute on function public.update_my_shop(uuid,text,text,text,boolean,text,text) to authenticated;
