-- ============================================================
-- MAZI — customer/business profile change history
-- Run after 01_schema.sql, 10_shops.sql and 22_super_admin.sql.
-- Records profile and shop edits with old/new values for Super Admin review.
-- ============================================================

create table if not exists public.profile_change_audit (
  id          bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('profile','business')),
  entity_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null default 'updated',
  changes     jsonb not null default '{}'::jsonb,
  changed_at  timestamptz not null default now()
);
create index if not exists profile_change_audit_changed_idx on public.profile_change_audit(changed_at desc);
create index if not exists profile_change_audit_user_idx on public.profile_change_audit(user_id, changed_at desc);

create or replace function public.capture_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
  old_value jsonb;
  new_value jsonb;
  diff jsonb := '{}'::jsonb;
begin
  for k, new_value in select key, value from jsonb_each(to_jsonb(new)) loop
    if k in ('created_at') then continue; end if;
    old_value := to_jsonb(old) -> k;
    if old_value is distinct from new_value then
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', old_value, 'new', new_value));
    end if;
  end loop;
  if diff = '{}'::jsonb then return new; end if;
  insert into public.profile_change_audit(entity_type, entity_id, user_id, actor_id, changes)
  values ('profile', new.id, new.id, auth.uid(), diff || jsonb_build_object('_account_snapshot', to_jsonb(new)));
  return new;
end;
$$;

drop trigger if exists profiles_change_audit on public.profiles;
create trigger profiles_change_audit
after update on public.profiles
for each row execute function public.capture_profile_change();

create or replace function public.capture_business_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
  old_value jsonb;
  new_value jsonb;
  diff jsonb := '{}'::jsonb;
begin
  for k, new_value in select key, value from jsonb_each(to_jsonb(new)) loop
    if k in ('created_at') then continue; end if;
    old_value := to_jsonb(old) -> k;
    if old_value is distinct from new_value then
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', old_value, 'new', new_value));
    end if;
  end loop;
  if diff = '{}'::jsonb then return new; end if;
  insert into public.profile_change_audit(entity_type, entity_id, user_id, actor_id, changes)
  values ('business', new.id, new.user_id, auth.uid(), diff || jsonb_build_object('_account_snapshot', to_jsonb(new)));
  return new;
end;
$$;

drop trigger if exists shops_change_audit on public.shops;
create trigger shops_change_audit
after update on public.shops
for each row execute function public.capture_business_change();

create or replace function public.admin_list_profile_changes(p_limit int default 200)
returns table (
  id bigint, entity_type text, entity_id uuid, user_id uuid, actor_id uuid,
  action text, changes jsonb, changed_at timestamptz,
  customer_name text, customer_email text, actor_email text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select a.id, a.entity_type, a.entity_id, a.user_id, a.actor_id, a.action,
         a.changes, a.changed_at,
         nullif(trim(concat_ws(' ', p.name, p.last_name)), ''), p.email, au.email::text
  from public.profile_change_audit a
  left join public.profiles p on p.id = a.user_id
  left join auth.users au on au.id = a.actor_id
  order by a.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

grant execute on function public.admin_list_profile_changes(int) to authenticated;
revoke all on public.profile_change_audit from anon, authenticated;
alter table public.profile_change_audit enable row level security;
grant select on public.profile_change_audit to authenticated;
drop policy if exists audit_history_super_admin_read on public.profile_change_audit;
create policy audit_history_super_admin_read on public.profile_change_audit
for select to authenticated using (public.is_super_admin());
