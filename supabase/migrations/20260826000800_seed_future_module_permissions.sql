-- Seeds permission keys + role grants for three modules that don't have real schema
-- yet: Purchase Trips (M4), Stock Distribution (M1c), and AI Studio (newly brought
-- into v1 scope — see constitution.md v1.6.0's §3 amendment). Decided this pass as
-- "design the role model now, build the RLS/UI once each module's real tables land"
-- (constitution §5's sequencing rule: M3/M4/M5 wait for M2, which hasn't started
-- yet). These role_permissions rows are harmless to seed ahead of the tables they'll
-- eventually gate — they sit unused by any RLS policy until each module's own
-- migration adds one, exactly the way inventory.write/billing.write have sat seeded
-- and unused since M1b (20260822090100) despite Inventory (M3) and POS (M5) not
-- existing yet either.
--
-- Full matrix and per-permission rationale: M-role-permission-model.md (project docs).
-- AI Studio module sketch: M-ai-studio.md (project docs).

insert into permissions (key) values
  ('trip.create'),
  ('trip.read'),
  ('stock.transfer.create'),
  ('stock.transfer.read'),
  ('content.create'),
  ('content.review'),
  ('content.publish')
on conflict (key) do nothing;

-- Purchase Trips (M4) and Stock Distribution (M1c): org_owner + org_manager, the same
-- cascade-to-every-store-in-the-org shape store.create/staff.invite already use — an
-- owner/manager acts across their whole org, not per store. Not granted to
-- org_accountant (read-only by design) or any store-scoped role (these are org-level
-- decisions: where stock comes from and how it's distributed, not day-to-day counter
-- operation — store_sales_staff stays scoped to billing/inventory as already seeded).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('trip.create', 'trip.read', 'stock.transfer.create', 'stock.transfer.read')
where r.name in ('org_owner', 'org_manager')
on conflict do nothing;

-- AI Studio: platform_editor drafts content; platform_content_lead reviews and
-- publishes it (and may also draft). Both are platform-scope roles seeded here for
-- the first time — named in M1b-core-tenancy.md §1 since v2.0.0 but deliberately
-- left unseeded until AI Studio was in scope. platform_admin needs no explicit grant
-- here: hasPermission's platform_admin check (entitlements.ts) is authoritative at
-- every scope regardless of role_permissions, same as every other permission.
insert into roles (name, scope_type) values
  ('platform_editor', 'platform'),
  ('platform_content_lead', 'platform')
on conflict (name) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key = 'content.create'
where r.name in ('platform_editor', 'platform_content_lead')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('content.review', 'content.publish')
where r.name = 'platform_content_lead'
on conflict do nothing;
