-- ============================================================
-- MAZI — add missing profile columns (last_name, dob)
-- Run in: Supabase Dashboard -> SQL Editor
--
-- The "Personal Details" profile form has Last Name and Date of
-- Birth fields, but public.profiles never had columns for them,
-- so those edits (and the profile page in general) only ever
-- lived in localStorage and vanished on logout. This adds the
-- columns so api.js -> updateProfile() has somewhere to save
-- them (safe to re-run).
-- ============================================================

alter table public.profiles
  add column if not exists last_name text,
  add column if not exists dob       date;

-- 01_schema.sql also column-locks which fields a shopper may UPDATE on
-- their own profiles row (grant update (name, email, mobile, ...)). New
-- columns are not covered by that grant automatically, so without this,
-- Postgres silently rejects UPDATEs to last_name/dob even though the
-- columns now exist. Re-declaring the full list (old + new) here.
grant update (name, last_name, email, mobile, dob, account_type, business_type, business_name, gst_tin,
              atoll, city, onboarded, notifications_enabled) on public.profiles to authenticated;
