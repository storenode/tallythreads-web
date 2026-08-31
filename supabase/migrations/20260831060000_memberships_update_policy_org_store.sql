-- Real bug fix: "platform admins can update memberships" (20260826000400) was
-- platform-admin-only, which blocks revokeOrganizationMember() (and the new
-- store-member revoke) for the exact people the permission matrix says should be
-- able to do this — an org_owner/org_manager holding org.manage_members for an
-- org-scoped row, or staff.revoke for a store-scoped one. Surfaced while wiring
-- the new store Members grid's revoke action; the org side had the identical gap.
--
-- Postgres has no ALTER POLICY for changing a definition, so drop + recreate under
-- a new name (matches this schema's existing convention of adding a new named
-- policy rather than silently redefining one, e.g. 20260830040000's roles/
-- permissions policies).
--
-- staff.revoke is granted at org scope to org_owner/org_manager
-- (20260822090100) — checking has_org_permission(store's org, 'staff.revoke')
-- for a store-scoped membership row is the same "operate any store in the org"
-- cascade has_store_permission()/the entitlements cascade already encode, not a
-- new authorization concept.

drop policy if exists "platform admins can update memberships" on memberships;

create policy "platform admins or scoped managers can update memberships" on memberships
  for update to authenticated
  using (
    public.is_platform_admin()
    or (
      organization_id is not null
      and public.has_org_permission(organization_id, 'org.manage_members')
    )
    or (
      store_id is not null
      and exists (
        select 1 from stores s
        where s.id = memberships.store_id
          and public.has_org_permission(s.organization_id, 'staff.revoke')
      )
    )
  )
  with check (
    public.is_platform_admin()
    or (
      organization_id is not null
      and public.has_org_permission(organization_id, 'org.manage_members')
    )
    or (
      store_id is not null
      and exists (
        select 1 from stores s
        where s.id = memberships.store_id
          and public.has_org_permission(s.organization_id, 'staff.revoke')
      )
    )
  );
