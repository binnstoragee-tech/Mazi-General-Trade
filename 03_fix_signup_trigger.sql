-- MAZI signup trigger fix
-- Run this once in Supabase Dashboard -> SQL Editor.
-- Fixes the generic "Database error saving new user" caused by older
-- profiles schemas/triggers and duplicate mobile values.

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

  -- Do not let an already-used mobile abort creation of a new auth user.
  if signup_mobile is not null and exists (
    select 1 from public.profiles where mobile = signup_mobile
  ) then
    signup_mobile := null;
  end if;

  begin
    insert into public.profiles (id, email, mobile)
    values (new.id, new.email, signup_mobile)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- Covers older databases where another unique profile value conflicts.
    insert into public.profiles (id, email, mobile)
    values (new.id, new.email, null)
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Verify the trigger after running:
-- select tgname from pg_trigger where tgname = 'on_auth_user_created';
