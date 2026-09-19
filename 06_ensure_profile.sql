-- ============================================================
-- MAZI — create the profile from the site instead of a database trigger
-- (the auth.users trigger kept breaking signup with
--  "Database error saving new user")
--
-- Run in: Supabase Dashboard -> SQL Editor -> "+" (new EMPTY query)
-- Paste this WHOLE file, click Run. Safe to re-run.
-- ============================================================

-- 1. Make sure the broken trigger stays removed
drop trigger if exists on_auth_user_created on auth.users;

-- 2. ensure_profile(): called by api.js after login/signup when the user
--    has no profile row yet. Reads email + mobile from the user's own token.
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

  insert into public.profiles (id, email, mobile)
  values (v_uid, v_email, v_mobile)
  on conflict (id) do update
    set email  = coalesce(public.profiles.email,  excluded.email),
        mobile = coalesce(public.profiles.mobile, excluded.mobile);

  select * into r from public.profiles where id = v_uid;
  return r;
end;
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant  execute on function public.ensure_profile() to authenticated;

-- 3. Create profiles for accounts that already exist without one
--    (for example the account you just created)
insert into public.profiles (id, email, mobile)
select u.id, u.email, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'mobile', '')), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

-- 4. Result: every account and whether it has a profile
select u.email,
       (p.id is not null) as has_profile,
       p.mobile
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc
limit 20;
