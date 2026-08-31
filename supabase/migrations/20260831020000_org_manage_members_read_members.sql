-- The org self-service members table (/org/:orgId/edit -> MembersCard ->
-- fetchOrganizationMembers in organizations.ts) reads `memberships` filtered by
-- organization_id, with `members(google_email, first_name, last_name, is_active)`
-- embedded. For a non-platform-admin org_owner both halves currently fail RLS:
--
--   * `memberships` SELECT policies are only `member_id = auth.uid()`
--     (20260826000000) and `is_platform_admin()` (20260826000300) -> the owner sees
--     nothing but their own row.
--   * `members` has exactly one SELECT policy, `is_platform_admin()`
--     (20260826000400) -- not even a self-read -- so the embedded join resolves to
--     null and every name/email column renders blank.
--
-- Fix: two OR'd SELECT policies gated on `org.manage_members`, the same permission
-- 20260831010000 used for organizations UPDATE (org_owner only per
-- M-role-permission-model.md §4 -- deliberately not org_manager/org_accountant).
-- has_org_permission() is security definer, so calling it from inside a memberships
-- policy does not recurse.

-- memberships: an org_owner (org.manage_members holder) can read every membership row
-- in that organization, not just their own.
create policy "org.manage_members can read org memberships" on memberships
  for select to authenticated
  using (
    organization_id is not null
    and public.has_org_permission(organization_id, 'org.manage_members')
  );

-- members: a caller can read a member row if it is their own, or if that member holds
-- a membership in an organization where the caller has org.manage_members.
create policy "members can read own member row" on members
  for select to authenticated
  using (id = auth.uid());

create policy "org.manage_members can read fellow org members" on members
  for select to authenticated
  using (
    exists (
      select 1
      from memberships m
      where m.member_id = members.id
        and m.organization_id is not null
        and m.deleted_at is null
        and public.has_org_permission(m.organization_id, 'org.manage_members')
    )
  );
