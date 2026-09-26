-- ============================================================
-- MAZI — revert customer accounts that got mistakenly flagged
-- as "admin sign-up requests" by the old claim_admin_signup bug.
-- Run this ONCE in Supabase SQL Editor after updating admin.js.
--
-- IMPORTANT: do NOT use the "Remove" button in Staff Access for
-- these accounts instead of this script — that button calls
-- admin_delete_signup_request(), which DELETES the auth.users row
-- entirely (see 32_admin_delete_signup_request.sql). For a real
-- customer that means their whole account, order history, etc.
-- would be permanently deleted. This script just fixes the flag.
-- ============================================================

-- 1) See who is currently sitting in the "pending admin" list but
--    is NOT actually staff (these are the suspects):
select id, email, name, signup_source, is_admin, is_super_admin, created_at
from public.profiles
where signup_source = 'admin' and is_admin = false and is_super_admin = false
order by created_at desc;

-- 2) Revert the specific account from the screenshot back to a
--    normal storefront/customer account:
update public.profiles
set signup_source = 'storefront'
where email = 'monir.monmon1119@gmail.com'
  and is_admin = false
  and is_super_admin = false;

-- 3) If step 1 shows other accounts you know are customers (not
--    people who genuinely asked for staff access), revert them the
--    same way, one email at a time:
-- update public.profiles
-- set signup_source = 'storefront'
-- where email = 'someone-else@example.com' and is_admin = false and is_super_admin = false;
