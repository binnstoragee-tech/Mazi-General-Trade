-- ============================================================
-- MAZI — PRODUCT IMAGE STORAGE BUCKET
-- Run AFTER 01_schema.sql (needs public.is_admin()).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
-- Safe to re-run.
--
-- Fixes "Bucket not found" when uploading a product photo in /admin.
-- api.js already expects a bucket named 'product-images' (see
-- uploadProductImage() / PRODUCT_IMAGE_BUCKET) — it was just never
-- created on the Supabase side. This is the public counterpart of the
-- private 'payment-slips' bucket set up in 01_schema.sql.
-- ============================================================

-- ---------- bucket ----------
-- public = true: product photos are meant to be seen directly by
-- customers on the storefront (no signed URLs needed).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ---------- read: public (anyone, even logged out, can view product photos) ----------
drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects for select
  using (bucket_id = 'product-images');

-- ---------- write: staff/admin only ----------
drop policy if exists "product images admin upload" on storage.objects;
create policy "product images admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ---------- quick check (should show the new bucket, public = true) ----------
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'product-images';
