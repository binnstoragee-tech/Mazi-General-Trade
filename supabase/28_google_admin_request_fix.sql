-- ============================================================
-- MAZI — reliable Google Admin approval requests
-- Run after 23_admin_signup_source.sql.
-- This is a focused repair; it does not reset existing staff access.
-- ============================================================

create or replace function public.claim_admin_signup()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(btrim(auth.jwt() ->> 'email'), '');
  v_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', '')), '');
  v_row public.profiles;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  insert into public.profiles (id, email, name, signup_source)
  values (v_uid, v_email, v_name, 'admin')
  on conflict (id) do nothing;

  update public.profiles
     set signup_source = 'admin',
         email = coalesce(public.profiles.email, v_email),
         name = coalesce(public.profiles.name, v_name)
   where id = v_uid
   returning * into v_row;

  if v_row.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  return v_row;
end;
$$;
revoke execute on function public.claim_admin_signup() from public, anon;
grant execute on function public.claim_admin_signup() to authenticated;
