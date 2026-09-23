-- =====================================================================
-- MAZI — 10_shops.sql
-- "My Accounts": a login can have extra Business / Residence accounts.
-- Run in Supabase → SQL Editor (after 01_schema.sql).
-- Business accounts start as 'pending' until approved (see bottom).
-- =====================================================================

create table if not exists public.shops (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_type  text not null check (account_type in ('business','residence')),
  name          text not null,
  business_type text,
  gst_tin       text,
  gst_exempt    boolean not null default false,   -- true = "not GST registered"
  atoll         text,
  city          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now()
);

create index if not exists shops_user_idx on public.shops (user_id);

alter table public.shops enable row level security;

drop policy if exists shops_select_own on public.shops;
create policy shops_select_own on public.shops
  for select using (user_id = auth.uid());

drop policy if exists shops_insert_own on public.shops;
create policy shops_insert_own on public.shops
  for insert with check (user_id = auth.uid());

-- Shoppers can NOT edit status. The server decides it on insert:
-- residence = approved right away, business = pending until staff approve.
create or replace function public.shops_set_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.status  := case when new.account_type = 'residence' then 'approved' else 'pending' end;
  return new;
end $$;

drop trigger if exists shops_set_status_trg on public.shops;
create trigger shops_set_status_trg before insert on public.shops
  for each row execute function public.shops_set_status();

-- To approve a business account (for now, from the SQL editor / Table editor):
--   update public.shops set status = 'approved' where id = '<shop id>';
