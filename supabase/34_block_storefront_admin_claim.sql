-- ============================================================
-- MAZI — a customer account must never land on the admin
-- approval screen, no matter how admin.html is reached.
-- Run after 23_admin_signup_source.sql / 28_google_admin_request_fix.sql.
--
-- Bago nito, ang claim_admin_signup() ay basta na lang nagse-set
-- ng signup_source = 'admin' sa kahit sinong currently-authenticated
-- user - kahit isa na siyang existing customer account. Ngayon,
-- ang tanging pwedeng ma-flag bilang "admin sign-up candidate" ay
-- yung account na WALA pang profile row bago pa man mag-request
-- (ibig sabihin, bagong account talaga, hindi dating gumamit ng
-- customer storefront).
-- ============================================================

create or replace function public.claim_admin_signup()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_row public.profiles;
  v_pre_existing boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_pre_existing := exists (select 1 from public.profiles where id = auth.uid());

  -- Google OAuth may return before a profile row exists. Create it first so
  -- the request is never lost and can be seen by the Super Admin.
  if not v_pre_existing then
    perform public.ensure_profile();
  end if;

  select * into v_row from public.profiles where id = auth.uid();

  -- An account that already existed as a storefront/customer account can
  -- never be turned into a pending admin request - not by this bug, not by
  -- any future one either. Only a brand-new account (no profile row until
  -- this very call) may request staff access this way.
  if v_pre_existing and v_row.signup_source = 'storefront' and coalesce(v_row.is_admin, false) = false then
    raise exception 'STOREFRONT_ACCOUNT';
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
