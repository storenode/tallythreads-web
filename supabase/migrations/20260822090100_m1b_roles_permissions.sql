-- M1b Phase 1, subtask 2: roles / permissions / role_permissions + seed data.
-- See specs/tasks/M1b-Core-Tenancy-Schema.md §1-2. One role/permission model spanning
-- all three scopes (platform, organization, store) — resolveEntitlements (Phase 2) is
-- the only code that ever interprets these rows.

create table permissions (
  id    uuid primary key default gen_random_uuid(),
  key   text unique not null
);

comment on table permissions is
  'Atomic capability keys, referenced by role_permissions. Not scoped themselves — '
  'scope comes from the role + the memberships row it is granted through.';

create table roles (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  scope_type  text not null check (scope_type in ('platform', 'organization', 'store'))
);

comment on table roles is
  'One row per role name. scope_type constrains which of memberships.organization_id/'
  'store_id a role of this kind is valid against — enforced at the application layer '
  '(memberships has no matching check constraint), not here.';

create table role_permissions (
  role_id        uuid not null references roles(id),
  permission_id  uuid not null references permissions(id),
  primary key (role_id, permission_id)
);

-- Seed permissions (M1b §2's canonical list).
insert into permissions (key) values
  ('org.create'),
  ('store.create'),
  ('staff.invite'),
  ('staff.revoke'),
  ('billing.write'),
  ('billing.read'),
  ('inventory.write'),
  ('inventory.read'),
  ('reports.read'),
  ('settlement.read'),
  ('maintenance.access'),
  ('org.manage_members');

-- Seed roles. Only the seven roles M1b §1 marks as seeded now:
--   platform_admin (platform scope)
--   org_owner, org_manager, org_accountant (organization scope)
--   store_sales_staff, store_cleaning_staff, store_temp_staff (store scope)
-- 'platform_editor' and 'platform_content_lead' are named in M1b §1 for the future
-- AI Studio module (constitution §3, P2+) but deliberately NOT seeded here.
insert into roles (name, scope_type) values
  ('platform_admin', 'platform'),
  ('org_owner', 'organization'),
  ('org_manager', 'organization'),
  ('org_accountant', 'organization'),
  ('store_sales_staff', 'store'),
  ('store_cleaning_staff', 'store'),
  ('store_temp_staff', 'store');

-- platform_admin: everything. resolveEntitlements (Phase 2) will special-case this
-- role for universal reach regardless of this table, but the full grant set is seeded
-- here too so role_permissions stays a complete, queryable record on its own.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.name = 'platform_admin';

-- org_owner: everything within the org — create stores, manage staff at every level,
-- full financial visibility.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in (
    'store.create', 'staff.invite', 'staff.revoke',
    'billing.write', 'billing.read', 'inventory.write', 'inventory.read',
    'reports.read', 'settlement.read', 'org.manage_members'
  )
where r.name = 'org_owner';

-- org_manager: create stores, invite/manage store-level staff, operate any store in
-- the org. No org.manage_members (owner-only, M1b §7 Open Question 3) and no
-- settlement.read (that's ownership-level financial visibility, not operational).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in (
    'store.create', 'staff.invite', 'staff.revoke',
    'billing.write', 'billing.read', 'inventory.write', 'inventory.read',
    'reports.read'
  )
where r.name = 'org_manager';

-- org_accountant: read-only — reports and settlement statements only. No billing/
-- inventory detail, no staff management, can't create a store.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('reports.read', 'settlement.read')
where r.name = 'org_accountant';

-- store_sales_staff / store_temp_staff: identical operational access (billing/POS/
-- inventory) — temp staff differs only in that revocation is manual, no auto-expiry.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('billing.write', 'billing.read', 'inventory.write', 'inventory.read')
where r.name in ('store_sales_staff', 'store_temp_staff');

-- store_cleaning_staff: scoped to a maintenance-related screen only — no billing,
-- no reports. Exact screen content is a later decision (M1b §1), not blocking here.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key = 'maintenance.access'
where r.name = 'store_cleaning_staff';
