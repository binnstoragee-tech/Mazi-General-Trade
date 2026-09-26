-- ============================================================
-- MAZI — reject / delete a pending Admin Sign Up request
-- Run after 22_super_admin.sql and 23_admin_signup_source.sql.
--
-- Ginagamit ng "Remove" button sa Staff Access > Admin sign-ups
-- para permanenteng alisin ang isang sign-up request na hindi pa
-- binibigyan ng staff access — mawawala ito sa listahan.
--
-- Hindi ito puwedeng gamitin sa account na mayroon nang staff
-- access (is_admin) — para diyan, gamitin pa rin ang "Remove
-- access" sa kebab menu (admin_set_staff_access).
-- ============================================================

create or replace function public.admin_delete_signup_request(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_row public.profiles;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.profiles where id = p_user;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  if v_row.signup_source is distinct from 'admin' then raise exception 'NOT_A_SIGNUP_REQUEST'; end if;
  if v_row.is_admin or v_row.is_super_admin then raise exception 'ALREADY_STAFF'; end if;
  delete from auth.users where id = p_user;
end;
$$;
grant execute on function public.admin_delete_signup_request(uuid) to authenticated;
