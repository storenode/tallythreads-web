-- Two additions for the /admin/orgs cards: an Edit action on each organization, and
-- per-org stats (store count, org-level member count, store-level staff count).
--
-- Edit: platform admins can rename an organization — same is_platform_admin() gate as
-- the insert policy from 20260826000200_organizations_invites_rls_policies.sql.
create policy "platform admins can update organizations" on organizations
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Stats: computing "N stores / N org members / N store members" per org means reading
-- every organization's memberships, not just the caller's own row (the existing
-- "members can read own memberships" policy from 20260826000000). Platform admins get
-- a second, broader SELECT policy for this — RLS policies are OR'd together, so this
-- adds visibility on top of, not instead of, the self-read policy everyone else keeps.
create policy "platform admins can read all memberships" on memberships
  for select to authenticated
  using (public.is_platform_admin());
