-- Platform-admin-only writes on `permissions`, mirroring roles' write policies from
-- 20260826000000_roles_entitlements_rls_policies.sql (same is_platform_admin() gate).
-- That migration only added a read policy for permissions (it was reference data
-- consumed by get-entitlements) — this adds the write side now that the admin
-- metadata screen manages permission keys directly via PostgREST, the same way
-- admin-create-role/admin-patch-role/admin-delete-role used to for roles.

create policy "platform admins can insert permissions" on permissions
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform admins can update permissions" on permissions
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform admins can delete permissions" on permissions
  for delete to authenticated
  using (public.is_platform_admin());
