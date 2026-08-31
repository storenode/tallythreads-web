-- Align the organizations table's write policies with M-role-permission-model.md §4.
--
-- Until now organizations was platform-admin-only for every write (insert from
-- 20260826000200, update from 20260826000300). That leaves the org self-service
-- profile screen (src/features/stores/pages/OrgProfilePage.tsx -> updateOrganization
-- in organizations.ts) non-functional for the very role the matrix says owns the org:
-- an org_owner signing in with platformRole=null matches no update policy, so the
-- save silently touches zero rows.
--
-- Matrix mapping (M-role-permission-model.md §4):
--   * CREATE  -> `org.create`, granted to NO role in role_permissions (platform_admin
--                passes only via the scope-agnostic short-circuit). Insert policy
--                stays is_platform_admin()-only -- unchanged, restated here for the
--                full CRUD picture.
--   * UPDATE  -> no dedicated key exists; `org.manage_members` (org_owner only, the
--                "everything within the org" grant) is the intended gate. Editing the
--                org's own profile row is the same authority as managing its members.
--   * DELETE  -> destructive, no role holds it. Hard delete already runs through
--                hard_delete_organization() (20260830020000), which enforces
--                is_platform_admin() inside the function; this adds the matching
--                table-level DELETE policy so a direct PostgREST .delete() is denied
--                the same way rather than falling through to "no policy = deny" with
--                no stated intent.
--
-- Soft archive (UPDATE ... SET deleted_at, archiveOrganization in organizations.ts)
-- runs through the UPDATE policy, so an org_owner can archive their own org. That was
-- the accepted trade-off when picking "reuse org.manage_members" over a column guard.

-- UPDATE: replace the platform-admin-only policy with platform-admin OR an org_owner
-- (any member whose org-scoped role grants org.manage_members in THIS org).
drop policy "platform admins can update organizations" on organizations;

create policy "platform admins or org.manage_members can update organizations" on organizations
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(id, 'org.manage_members')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(id, 'org.manage_members')
  );

-- DELETE: platform-admin only, mirroring hard_delete_organization()'s own guard.
create policy "platform admins can delete organizations" on organizations
  for delete to authenticated
  using (public.is_platform_admin());
