-- Extends the org-scoped member-read RLS (20260831020000_org_manage_members_read_members.sql,
-- gated on org.manage_members) with the store-scoped counterpart, gated on
-- staff.invite — the same permission invite_store_member() already authorizes on.
-- Without this, the store edit page's Members grid (fetchStoreMembers) renders blank
-- names/emails for anyone who isn't a platform admin or the member themselves, and
-- the new store-scoped member-edit page (StoreMemberEditPage) has no way to read the
-- profile fields it needs to pre-fill. Same reasoning as the org-scoped version:
-- has_org_permission() is security definer, so calling it from inside these policies
-- does not recurse.

-- memberships: a staff.invite holder (on the store's parent org) can read every
-- membership row on that store, not just their own.
create policy "staff.invite can read store memberships" on memberships
  for select to authenticated
  using (
    store_id is not null
    and exists (
      select 1 from stores s
      where s.id = memberships.store_id
        and public.has_org_permission(s.organization_id, 'staff.invite')
    )
  );

-- members: a caller can read a member row if that member holds a store-scoped
-- membership at a store whose parent org the caller has staff.invite on.
create policy "staff.invite can read fellow store members" on members
  for select to authenticated
  using (
    exists (
      select 1
      from memberships m
      join stores s on s.id = m.store_id
      where m.member_id = members.id
        and m.store_id is not null
        and m.deleted_at is null
        and public.has_org_permission(s.organization_id, 'staff.invite')
    )
  );
