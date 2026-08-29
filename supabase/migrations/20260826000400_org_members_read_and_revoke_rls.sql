-- Supports the /admin/orgs/:orgId/edit members table: who's an active member of this
-- org (memberships), who's still pending (store_invitations), and soft-deleting either
-- one (never a hard delete — same convention as everywhere else in this schema).

-- `members` had RLS enabled with zero policies (20260820002936_enable_members_rls.sql's
-- deny-all stopgap) and nothing has granted a read since — needed now so the members
-- table can show an invitee's/member's email and name, not just an opaque member_id.
create policy "platform admins can read all members" on members
  for select to authenticated
  using (public.is_platform_admin());

-- Removing a member from an org = soft-delete their memberships row (deleted_at), not
-- a hard delete. Mirrors the pattern everywhere else in this schema.
create policy "platform admins can update memberships" on memberships
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Revoking a pending invite = status -> 'revoked' on its store_invitations row, scoped
-- to org-level (store_id null) invitations the same way the insert/select policies
-- from 20260826000200/300 already are — store-level invite revocation is a separate,
-- not-yet-built policy with a different authorizer (org_owner/org_manager).
create policy "platform admins can update org-scoped invitations" on store_invitations
  for update to authenticated
  using (
    public.is_platform_admin()
    and organization_id is not null
    and store_id is null
  )
  with check (
    public.is_platform_admin()
    and organization_id is not null
    and store_id is null
  );
