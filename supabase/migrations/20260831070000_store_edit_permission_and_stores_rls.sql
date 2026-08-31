-- Backs the new Stores CRUD (edit/archive) UI: a store.edit permission, granted
-- to org_owner + org_manager (the same pair store.create already sits on — an
-- owner/manager manages any store in their org, not just the ones they hold a
-- separate store-level row on), plus the stores UPDATE/DELETE RLS policies that
-- were simply missing until now (only INSERT — 20260826000600 — and the blanket
-- SELECT from 20260826000000 existed). Soft-delete (archive) is a plain UPDATE
-- setting deleted_at, so it rides the same UPDATE policy as any other edit — no
-- separate archive policy needed, mirroring organizations' own archive path.
--
-- Hard delete stays platform-admin-only by design (2026-08-30 scoping decision,
-- same posture as hard_delete_organization) — see hard_delete_store() in the next
-- migration; the DELETE policy below exists mostly for symmetry/defense-in-depth
-- since the real delete path is the security-definer RPC, not a raw client delete.

insert into permissions (key, module) values
  ('store.edit', 'Tenancy')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'store.edit'
where r.name in ('org_owner', 'org_manager')
on conflict do nothing;

create policy "platform admins or store.edit members can update stores" on stores
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  );

create policy "platform admins can delete stores" on stores
  for delete to authenticated
  using (public.is_platform_admin());
