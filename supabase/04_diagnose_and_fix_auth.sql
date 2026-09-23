-- ============================================================
-- MAZI — diagnose + fix "Database error" on login / create account
-- Run in: Supabase Dashboard -> SQL Editor
--
-- STEP 1: Run PART A alone first and read the result.
-- STEP 2: Run PART B (safe to re-run).
-- ============================================================


-- ============================================================
-- PART A — DIAGNOSTIC (read-only, changes nothing)
-- Look for: (1) any trigger on auth.users OTHER than on_auth_user_created,
--           (2) any profiles column that is nullable = NO with default = -
--               (except id), (3) any weird constraint on profiles.
-- ============================================================
select 'trigger on auth.users' as kind, tgname::text as name, pg_get_triggerdef(oid) as detail
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal
union all
select 'trigger on profiles', tgname::text, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal
union all
select 'profiles column', column_name::text,
       data_type || ' | nullable=' || is_nullable || ' | default=' || coalesce(column_default, '-')
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
union all
select 'profiles constraint', conname::text, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass;


-- ============================================================
-- PART B — FIX
-- ============================================================

-- B1. Old profiles table? "create table if not exists" in 01_schema.sql never
--     updates an existing table, so add any columns that may be missing.
alter table public.profiles
  add column if not exists mobile                text,
  add column if not exists name                  text,
  add column if not exists email                 text,
  add column if not exists account_type          text        not null default 'residence',
  add column if not exists business_type         text,
  add column if not exists business_name         text,
  add column if not exists gst_tin               text,
  add column if not exists business_verified     boolean     not null default false,
  add column if not exists atoll                 text,
  add column if not exists city                  text,
  add column if not exists onboarded             boolean     not null default false,
  add column if not exists notifications_enabled boolean     not null default true,
  add column if not exists is_admin              boolean     not null default false,
  add column if not exists created_at            timestamptz not null default now();

-- B2. Leftover NOT NULL columns (no default) from an older schema make the
--     signup insert fail. Relax them (id stays required).
do $$
declare r record;
begin
  for r in
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and is_nullable = 'NO' and column_default is null
      and column_name <> 'id'
  loop
    execute format('alter table public.profiles alter column %I drop not null', r.column_name);
  end loop;
end $$;

-- B3. Signup trigger that can NEVER block account creation.
--     Worst case the profile row is created with just id/email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_mobile text;
begin
  signup_mobile := case
    when new.phone is not null and new.phone <> '' then
      case when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end
    when coalesce(new.raw_user_meta_data->>'mobile', '') <> '' then
      case when left(new.raw_user_meta_data->>'mobile', 1) = '+'
           then new.raw_user_meta_data->>'mobile'
           else '+' || new.raw_user_meta_data->>'mobile' end
    else null
  end;

  if signup_mobile is not null
     and exists (select 1 from public.profiles where mobile = signup_mobile) then
    signup_mobile := null;
  end if;

  begin
    insert into public.profiles (id, email, mobile)
    values (new.id, new.email, signup_mobile)
    on conflict (id) do nothing;
  exception when others then
    begin
      insert into public.profiles (id, email)
      values (new.id, new.email)
      on conflict (id) do nothing;
    exception when others then
      raise warning 'handle_new_user: could not create profile for %: %', new.id, sqlerrm;
    end;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- B4. Users who already exist in auth but have no profile row
--     (their onboarding save would otherwise fail).
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;


-- ============================================================
-- PART C — ONLY IF PART A SHOWED EXTRA TRIGGERS ON auth.users
-- If Part A listed a trigger on auth.users that is NOT on_auth_user_created
-- (e.g. an old "handle_new_user_old", "sync_profile", etc.), that is very
-- likely the culprit. Drop it by name (replace the name below), then retry.
-- ============================================================
-- drop trigger if exists <trigger_name_from_part_a> on auth.users;


-- ============================================================
-- PART D — ONLY IF LOGIN says "Database error querying schema"
-- and the account was created manually / through SQL.
-- ============================================================
-- update auth.users
--    set confirmation_token     = coalesce(confirmation_token, ''),
--        recovery_token         = coalesce(recovery_token, ''),
--        email_change_token_new = coalesce(email_change_token_new, ''),
--        email_change           = coalesce(email_change, '')
--  where confirmation_token is null or recovery_token is null
--     or email_change_token_new is null or email_change is null;
