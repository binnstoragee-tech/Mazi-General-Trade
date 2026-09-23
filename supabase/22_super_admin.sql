-- ============================================================
-- MAZI — Super Admin (staff access control)
-- Run in: Supabase Dashboard -> SQL Editor (safe to re-run)
--
-- Dati, ang pagbibigay ng staff access (is_admin) ay manual SQL
-- lang (README step A.5) — walang record kung sino ang nagbigay,
-- at kahit sino may access sa SQL Editor ay puwedeng gumawa ng
-- admin. Idinaragdag nito:
--
--   - profiles.is_super_admin — puwedeng magbigay/bawi ng staff
--     access (at ng Super Admin mismo) sa ibang account, sa loob
--     ng dashboard mismo (walang SQL Editor pa kailangan pagkatapos
--     ng unang setup sa ibaba).
--   - profiles.staff_name — hiwalay na pangalan na ginagamit lang
--     ng dashboard ("Good afternoon, ...") at hindi kinukuha mula
--     sa "First Name" na binabago ng account sa customer-facing na
--     Personal Details (index.html). Dati, iisa lang (`name`) ang
--     column kaya nagbabago ang dalawa nang sabay — hindi ito bug,
--     magkasamang binabasa lang ng dalawang page ang parehong
--     account/profile row dahil iisang login ang ginagamit.
-- ============================================================

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists staff_name      text;

-- Staff may set their own dashboard display name only — does not touch
-- is_admin / is_super_admin, so it can't be used to self-promote.
grant update (staff_name) on public.profiles to authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_super_admin() to anon, authenticated;

-- Every account, for the Staff Access screen. Super admin only.
create or replace function public.admin_list_accounts()
returns setof public.profiles
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.profiles order by created_at desc;
end;
$$;
grant execute on function public.admin_list_accounts() to authenticated;

-- Grant or revoke staff (admin) access. Super admin only.
create or replace function public.admin_set_staff_access(p_user uuid, p_is_admin boolean)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row public.profiles;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if p_user = auth.uid() and not p_is_admin then raise exception 'CANNOT_REMOVE_SELF'; end if;
  update public.profiles set is_admin = p_is_admin where id = p_user returning * into v_row;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  return v_row;
end;
$$;
grant execute on function public.admin_set_staff_access(uuid, boolean) to authenticated;

-- Grant or revoke Super Admin. Super admin only. Making someone a super admin
-- also gives them staff access; the last remaining super admin can't be removed
-- (there must always be at least one account that can manage staff access).
create or replace function public.admin_set_super_admin(p_user uuid, p_is_super boolean)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row public.profiles; v_others int;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if not p_is_super then
    select count(*) into v_others from public.profiles where is_super_admin and id <> p_user;
    if v_others = 0 then raise exception 'LAST_SUPER_ADMIN'; end if;
    update public.profiles set is_super_admin = false where id = p_user returning * into v_row;
  else
    update public.profiles set is_super_admin = true, is_admin = true where id = p_user returning * into v_row;
  end if;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  return v_row;
end;
$$;
grant execute on function public.admin_set_super_admin(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- One-time bootstrap: gawing unang Super Admin ang sarili mong account
-- (palitan ang email sa ibaba, i-run nang isang beses lang). Pagkatapos
-- nito, puwede ka nang magbigay ng staff access sa iba mula sa dashboard
-- mismo (Staff Access), hindi na kailangan pang bumalik dito.
-- ------------------------------------------------------------
-- update public.profiles set is_admin = true, is_super_admin = true where email = 'email-mo@example.com';
