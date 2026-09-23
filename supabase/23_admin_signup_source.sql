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
--   - Lahat ng account nakikita pa rin sa admin account list para sa
--     reference, pero Staff Access ay para lamang sa admin.html signups.
--   - Ang restriction ay nasa permission check at signup_source check ng
--     admin_set_staff_access() mismo, kaya hindi ito UI-only rule.
-- ============================================================

alter table public.profiles
  add column if not exists signup_source text not null default 'storefront'
    check (signup_source in ('storefront','admin'));

-- The only Super Admin is the MAZI company account. Repair any older or
-- accidentally elevated account whenever this migration is re-run.
update public.profiles
set is_super_admin = (
      lower(btrim(coalesce(email, ''))) = 'mazigeneraltrade@gmail.com'
      or exists (select 1 from auth.users u where u.id = profiles.id and lower(u.email) = 'mazigeneraltrade@gmail.com')
    ),
    is_admin = case when (
      lower(btrim(coalesce(email, ''))) = 'mazigeneraltrade@gmail.com'
      or exists (select 1 from auth.users u where u.id = profiles.id and lower(u.email) = 'mazigeneraltrade@gmail.com')
    ) then true else is_admin end;

update public.profiles p
set email = 'mazigeneraltrade@gmail.com', name = 'MAZI General Trade', mobile = '9291600'
where lower(btrim(coalesce(p.email, ''))) = 'mazigeneraltrade@gmail.com'
   or exists (select 1 from auth.users u where u.id = p.id and lower(u.email) = 'mazigeneraltrade@gmail.com');

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin
                   from public.profiles
                   where id = auth.uid())
                  and lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'mazigeneraltrade@gmail.com', false);
$$;
grant execute on function public.is_super_admin() to anon, authenticated;

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

  insert into public.profiles (id, email, name, mobile, signup_source)
  values (v_uid, v_email, nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', '')), ''), v_mobile, v_source)
  on conflict (id) do update
    set email  = coalesce(public.profiles.email,  excluded.email),
        name   = coalesce(public.profiles.name, excluded.name),
        mobile = coalesce(public.profiles.mobile, excluded.mobile);

  select * into r from public.profiles where id = v_uid;
  return r;
end;
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant  execute on function public.ensure_profile() to authenticated;

-- A user who deliberately starts Google sign-in from admin.html may be
-- listed in Staff Access, but this does not grant dashboard access. A Super
-- Admin must still grant is_admin through admin_set_staff_access().
create or replace function public.claim_admin_signup()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Google OAuth may return before a profile row exists. Create it first so
  -- the request is never lost and can be seen by the Super Admin.
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    perform public.ensure_profile();
  end if;
  update public.profiles
  set signup_source = 'admin',
      email = coalesce(email, auth.jwt() ->> 'email'),
      name = coalesce(name, nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', '')), ''))
  where id = auth.uid()
  returning * into v_row;
  if v_row.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  return v_row;
end;
$$;
revoke execute on function public.claim_admin_signup() from public, anon;
grant execute on function public.claim_admin_signup() to authenticated;

-- Every account, for the account-management screens (customer storefront
-- included, so a Super Admin can see who registered where). Super admin only.
create or replace function public.admin_list_accounts()
returns setof public.profiles
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.profiles order by created_at desc;
end;
$$;
grant execute on function public.admin_list_accounts() to authenticated;

-- Grant or revoke staff (admin) access. Super admin only. Only an account
-- created through admin.html may be granted staff access; the restriction is
-- enforced here at database level, not only by the dashboard UI.
create or replace function public.admin_set_staff_access(p_user uuid, p_is_admin boolean)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row public.profiles;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  -- Protect only the primary Super Admin account. Use the target profile's
  -- email instead of comparing UUIDs so a stale profile mapping cannot make
  -- xfrancisco look like the currently logged-in MAZI account.
  if not p_is_admin and exists (
    select 1 from public.profiles
    where id = p_user and (
      lower(btrim(coalesce(email, ''))) = 'mazigeneraltrade@gmail.com'
      or exists (select 1 from auth.users u where u.id = profiles.id and lower(u.email) = 'mazigeneraltrade@gmail.com')
    )
  ) then
    raise exception 'CANNOT_REMOVE_PRIMARY_SUPER_ADMIN';
  end if;
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
