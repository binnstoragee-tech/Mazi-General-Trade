-- ============================================================
-- MAZI — separate admin accounts from customer storefront accounts
-- Run in: Supabase Dashboard -> SQL Editor (safe to re-run)
--
-- Dati, iisang "profiles" table lang ang ginagamit ng customer
-- storefront (index.html) at ng staff dashboard (admin.html), kaya
-- walang paraan para malaman kung saan talaga nag-signup ang isang
-- account. Idinaragdag nito:
--
--   - profiles.signup_source ('storefront' | 'admin') — saan
--     ginawa ang account. Nakukuha mula sa signup metadata
--     (options.data.source) na ipinapasa ng admin.js / script.js.
--   - Lahat ng account nakikita pa rin sa Staff Access list (para
--     may makita ka pa ring listahan/details ng mga customer na
--     nag-register sa store front), pero yung "Grant staff access"
--     button lumalabas lang sa mga admin.html signups — storefront
--     accounts hindi na puwedeng i-promote (admin.js + DB, pareho).
--   - admin_set_staff_access() tumatanggi rin sa DB level, kahit
--     tawagin diretso, kaya hindi ito UI trick lang.
-- ============================================================

alter table public.profiles
  add column if not exists signup_source text not null default 'storefront'
    check (signup_source in ('storefront','admin'));

-- Grandfather in accounts that already have staff/super-admin access
-- (created before this column existed) so they don't disappear from
-- the Staff Access list.
update public.profiles
  set signup_source = 'admin'
  where (is_admin or is_super_admin) and signup_source <> 'admin';

-- ensure_profile() (see 06_ensure_profile.sql) creates the profile row
-- lazily on first login/signup since there is no more auth.users
-- trigger. Re-create it so it also stores where the account signed up.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := auth.jwt() ->> 'email';
  v_mobile text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'mobile', '')), '');
  v_source text := case when (auth.jwt() -> 'user_metadata' ->> 'source') = 'admin' then 'admin' else 'storefront' end;
  r        public.profiles;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- a mobile number already used by another account must not block this one
  if v_mobile is not null
     and exists (select 1 from public.profiles where mobile = v_mobile and id <> v_uid) then
    v_mobile := null;
  end if;

  insert into public.profiles (id, email, mobile, signup_source)
  values (v_uid, v_email, v_mobile, v_source)
  on conflict (id) do update
    set email  = coalesce(public.profiles.email,  excluded.email),
        mobile = coalesce(public.profiles.mobile, excluded.mobile);

  select * into r from public.profiles where id = v_uid;
  return r;
end;
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant  execute on function public.ensure_profile() to authenticated;

-- Every account, for the Staff Access screen (customer storefront included,
-- so a Super Admin can see who registered where) — but only admin.html
-- signups can ever be promoted (see admin_set_staff_access below). Super
-- admin only.
create or replace function public.admin_list_accounts()
returns setof public.profiles
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.profiles order by created_at desc;
end;
$$;
grant execute on function public.admin_list_accounts() to authenticated;

-- Grant or revoke staff (admin) access. Super admin only. A storefront
-- (customer) account can never be granted staff access, even by calling
-- this function directly — it must have signed up through admin.html.
create or replace function public.admin_set_staff_access(p_user uuid, p_is_admin boolean)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row public.profiles;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if p_user = auth.uid() and not p_is_admin then raise exception 'CANNOT_REMOVE_SELF'; end if;
  if p_is_admin and not exists (
    select 1 from public.profiles where id = p_user and signup_source = 'admin'
  ) then
    raise exception 'STOREFRONT_ACCOUNT';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user returning * into v_row;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  return v_row;
end;
$$;
grant execute on function public.admin_set_staff_access(uuid, boolean) to authenticated;
