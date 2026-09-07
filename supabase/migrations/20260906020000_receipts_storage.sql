-- Private Storage bucket for Purchase-Trip receipt images (active phase). Object path is
-- `{organization_id}/{trip_id}/{uuid}.jpg` so RLS can gate by the org in the first path
-- segment — upload needs trip.create, read needs trip.read, mirroring the purchase_* tables.
-- The image is kept for audit; extraction itself doesn't need it stored.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "trip members can upload receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'trip.create')
  );

create policy "trip members can read receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'trip.read')
  );

create policy "platform admins manage receipts" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_platform_admin())
  with check (bucket_id = 'receipts' and public.is_platform_admin());
