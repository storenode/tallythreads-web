-- RLS policies for the "Organization only" slice of M1b-core-tenancy.md §5 (Phase 3):
-- admin provisions an organization and invites its Owner/Manager/Accountant by email.
-- Authorization lives in RLS (is_platform_admin(), from
-- 20260826000000_roles_entitlements_rls_policies.sql), not inside an Edge Function —
-- same pattern as the roles/permissions metadata screens, chosen deliberately over
-- the original spec's provision-organization Edge Function design.
--
-- Store creation and store-level staff invites are a deliberately separate, later
-- migration — this one only covers what OrgFormPage/OrgCards need.

-- Platform admins provision organizations. No self-serve org creation in M1 (M1b §1's
-- "admin-provisioned onboarding" decision, v1.1.0 changelog entry).
create policy "platform admins can insert organizations" on organizations
  for insert to authenticated
  with check (public.is_platform_admin());

-- Platform admins can see every organization (the /admin/orgs list). A member with an
-- active membership in an org can see that org too — not exercised by any screen yet,
-- but the natural read boundary once an org-scoped screen exists, so it lands now
-- rather than as a second migration later.
create policy "platform admins can read all organizations" on organizations
  for select to authenticated
  using (public.is_platform_admin());

create policy "members can read their own organizations" on organizations
  for select to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.organization_id = organizations.id
        and m.member_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- Org-scoped invitations (Owner/Manager/Accountant): platform-admin only, and only
-- for organization_id-shaped rows — store_id-shaped (staff) invitations are a
-- separate, not-yet-built policy with a different authorizer (org_owner/org_manager
-- at that store's org), left for the store-creation follow-up.
create policy "platform admins can insert org-scoped invitations" on store_invitations
  for insert to authenticated
  with check (
    public.is_platform_admin()
    and organization_id is not null
    and store_id is null
  );

-- Platform admins can see every invitation (to show pending-invite counts on
-- /admin/orgs). Invited members reading/accepting their own pending invitation is
-- deliberately out of scope here — that's the accept-flow follow-up, not this pass.
create policy "platform admins can read all invitations" on store_invitations
  for select to authenticated
  using (public.is_platform_admin());
