-- ============================================================
-- MAZI — keep a Super Admin record when a customer deletes an account
-- Run after 26_profile_change_audit.sql.
-- ============================================================

-- Audit records must survive deletion of auth.users.
alter table public.profile_change_audit alter column user_id drop not null;
alter table public.profile_change_audit drop constraint if exists profile_change_audit_user_id_fkey;
alter table public.profile_change_audit
  add constraint profile_change_audit_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_shop record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;

  -- Snapshot the customer identity before auth deletion cascades to profiles.
  if to_regclass('public.profile_change_audit') is not null then
    insert into public.profile_change_audit(entity_type, entity_id, user_id, actor_id, action, changes)
    values (
      'profile', v_uid, v_uid, v_uid, 'deleted',
      jsonb_build_object('deleted_account', jsonb_build_object(
        'name', v_profile.name, 'last_name', v_profile.last_name,
        'email', coalesce(v_profile.email, auth.jwt()->>'email'), 'mobile', v_profile.mobile,
        'account_type', v_profile.account_type, 'business_name', v_profile.business_name,
        'business_type', v_profile.business_type, 'gst_tin', v_profile.gst_tin,
        'atoll', v_profile.atoll, 'city', v_profile.city,
        'deleted_at', now()
      ))
    );
    for v_shop in select * from public.shops where user_id = v_uid loop
      insert into public.profile_change_audit(entity_type, entity_id, user_id, actor_id, action, changes)
      values (
        'business', v_shop.id, v_uid, v_uid, 'deleted',
        jsonb_build_object('deleted_business_account', to_jsonb(v_shop))
      );
    end loop;
  end if;

  -- Keep order history but remove the deleted customer's identifying data.
  update public.orders
     set customer_name = 'Deleted account', customer_mobile = '', location = '{}'::jsonb, user_id = null
   where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
grant execute on function public.delete_my_account() to authenticated;
