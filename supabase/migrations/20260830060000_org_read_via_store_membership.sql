-- Closes a real gap surfaced while designing the /ops store picker (2026-08-30):
-- "members can read their own organizations" (20260826000200) only matches
-- memberships rows with organization_id set — i.e. an org-level role. A member who
-- holds ONLY a store-level membership (store_sales_staff, store_manager, ...) in an
-- org they have no org-level role in — the exact cross-organization staffing case
-- from the business-fit discussion (someone working a shift at one org's store while
-- also holding org-level access elsewhere) — could not read that org's name at all,
-- which the store picker needs to label each store's card ("Bandrip Demo — Nellore
-- Branch"). `stores` itself needed no equivalent fix: "authenticated can read stores"
-- (20260826000000) already grants every authenticated member unrestricted store read,
-- deliberately, for the entitlements org-cascade — see that migration's own comment.
--
-- RLS policies are OR'd together (same pattern as the platform-admin/self-read split
-- on this same table), so this adds visibility on top of the existing policy, it
-- doesn't replace it.
create policy "members can read orgs via a store membership" on organizations
  for select to authenticated
  using (
    exists (
      select 1
      from memberships m
      join stores s on s.id = m.store_id
      where s.organization_id = organizations.id
        and m.member_id = auth.uid()
        and m.deleted_at is null
    )
  );
