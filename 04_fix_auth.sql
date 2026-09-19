-- ============================================================
-- MAZI — fix "Database error" on login / create account
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Paste this WHOLE file and click Run. Safe to re-run.
-- ============================================================

-- 1. Make sure the profiles table has every column the site expects
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

-- 2. Remove leftover NOT NULL columns (no default) that break signup
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

-- 3. Signup trigger that can never block account creation
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

-- 4. Create a profile for any existing user that doesn't have one yet
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
