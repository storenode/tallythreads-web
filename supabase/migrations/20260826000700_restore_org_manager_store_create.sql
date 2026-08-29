-- Reverses part of 20260826000600's role_permissions delete: org_manager gets
-- store.create back, alongside org_owner.
--
-- Checking M1b-core-tenancy.md §5 Phase 3 subtask 3 (the original spec for this
-- exact feature) against last session's "org_owner only" call: the spec's own design
-- was "create-store Edge Function (hasPermission gate: org_owner/org_manager at the
-- target org)" — org_owner-only was narrower than what this project had already
-- decided, not a deliberate divergence from it. Restoring it here brings
-- role_permissions back in line with that spec.
--
-- No RLS change needed: 20260826000600's has_org_permission()/stores INSERT policy
-- already check role_permissions generically (not a hardcoded role name), so
-- re-granting the permission here is the entire fix — org_manager members now pass
-- the same has_org_permission(organization_id, 'store.create') check org_owner does.

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'store.create'
where r.name = 'org_manager'
  and not exists (
    select 1 from role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );
