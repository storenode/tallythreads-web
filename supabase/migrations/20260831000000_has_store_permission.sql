-- Generic store-permission check, the store-scope counterpart of has_org_permission()
-- (20260826000600_stores_create_rls.sql). Returns true for either:
--   1. a direct store-level membership on target_store_id (store_manager,
--      store_sales_staff, store_temp_staff, store_cleaning_staff, ...) whose role
--      grants permission_key, or
--   2. an org-level membership on target_store_id's parent organization whose role
--      grants permission_key — the org_owner/org_manager "operate any store in the
--      org" cascade the permission matrix already promises them via
--      billing.read/write and inventory.read/write (M-role-permission-model.md §2-4).
--
-- Mirrors has_org_permission()'s own convention exactly: no is_platform_admin() short
-- circuit baked in here — that's composed at the call site, same as
-- "public.is_platform_admin() or public.has_org_permission(...)" in the stores insert
-- policy, so this stays a pure permission-key check, not a bypass.
--
-- This is the RLS-side mirror of the cascade added to fetchEntitlements() the same
-- day (src/features/auth/entitlements.ts) — that function merges cascaded stores into
-- entitlements.stores client-side for routing/UX; this function re-derives the same
-- rule independently in the database, which is the actual authorization boundary.
--
-- Not referenced by any policy yet — M3 (inventory) and M5 (billing) haven't landed,
-- so there's no store-scoped table to gate. Seeded ahead of schema on purpose, same
-- as the billing.*/inventory.* permission keys themselves being Seeded, not Live
-- (M-role-permission-model.md §5, §1's build-status legend). Whichever module builds
-- those tables should write `using (has_store_permission(store_id, 'billing.write'))`
-- (or has_org_permission(organization_id, ...) or is_platform_admin(), composed the
-- same way store.create's policy does) rather than a bespoke policy.
create or replace function public.has_store_permission(
  target_store_id uuid,
  permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      -- direct store-level membership
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where m.member_id = auth.uid()
        and m.store_id = target_store_id
        and m.deleted_at is null
        and p.key = permission_key
    )
    or exists (
      -- org-level membership on the store's parent org (the org_owner/org_manager cascade)
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      join stores s on s.id = target_store_id
      where m.member_id = auth.uid()
        and m.organization_id = s.organization_id
        and m.deleted_at is null
        and p.key = permission_key
    );
$$;

comment on function public.has_store_permission(uuid, text) is
  'True if the calling member (auth.uid()) can exercise permission_key at '
  'target_store_id — either via a direct store-scoped membership on that store, or '
  'via an org-scoped membership on the store''s parent organization (the '
  'org_owner/org_manager "operate any store in the org" cascade). Store-scope '
  'counterpart of has_org_permission(); mirrors the cascade fetchEntitlements() '
  'applies client-side the same day. No is_platform_admin() bypass baked in — compose '
  'that at the call site, same convention has_org_permission() uses. Not yet '
  'referenced by any RLS policy — seeded ahead of the M3/M5 tables that will use it.';

revoke all on function public.has_store_permission(uuid, text) from public;
grant execute on function public.has_store_permission(uuid, text) to authenticated;
