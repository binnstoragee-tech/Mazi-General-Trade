-- ============================================================
-- MAZI — RESET the signup trigger (fixes "Database error saving new user")
-- Run in: Supabase Dashboard -> SQL Editor -> "+" (new EMPTY query)
-- Paste this WHOLE file, click Run. Safe to re-run.
-- The LAST result table lists every trigger inside the auth schema —
-- screenshot it if signup still fails.
-- ============================================================

-- 1. Remove the old trigger + function completely (start clean)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- 2. Recreate the function (never blocks signup)
create function public.handle_new_user()
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

-- 3. Let Supabase Auth's own database role run it
--    (01_schema.sql revokes EXECUTE on all functions, which can block it)
alter function public.handle_new_user() owner to postgres;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- 4. Attach the trigger again
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Create a profile for any existing user that has none
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 6. DIAGNOSTIC (last result): every trigger in the auth schema + event triggers
select c.relname::text as table_name, t.tgname::text as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and not t.tgisinternal
union all
select 'EVENT TRIGGER', evtname::text, evtevent::text
from pg_event_trigger;
