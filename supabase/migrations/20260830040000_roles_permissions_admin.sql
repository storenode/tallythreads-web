-- Backs the new /admin/roles screen: a Role x Permission grant matrix, grouped by
-- module, with the ability to define new roles and permission keys — built directly
-- on the existing roles/permissions/role_permissions model from
-- 20260822090100_m1b_roles_permissions.sql rather than a new schema. See
-- M-role-permission-model.md for the full existing catalog this backfills against.
--
-- Two additions, both driven by a real prior incident: M-admin-org-module.md records
-- that an earlier version of this screen let someone rename org_accountant to
-- org_stock_keeper live, diverging from the seed migrations, with "no guardrail yet"
-- flagged as a known gap. This migration closes it for both roles AND permissions
-- (renaming/deleting a seeded permission KEY is just as dangerous — every RLS policy
-- and has_org_permission() call that references it by string literal would silently
-- stop matching).

-- 1. permissions.module — a real column instead of parsing it out of the key string.
-- Needed because the key convention isn't uniform: most keys are `module.action`
-- (org.create), but stock.transfer.create/read are `module.submodule.action` — naive
-- prefix-splitting on the first dot would misgroup those two under "stock" instead of
-- "Stock Distribution".
alter table permissions add column module text;

update permissions set module = v.module
from (values
  ('org.create', 'Tenancy'),
  ('store.create', 'Tenancy'),
  ('staff.invite', 'Tenancy'),
  ('staff.revoke', 'Tenancy'),
  ('org.manage_members', 'Tenancy'),
  ('billing.write', 'Billing'),
  ('billing.read', 'Billing'),
  ('inventory.write', 'Inventory'),
  ('inventory.read', 'Inventory'),
  ('reports.read', 'Reports'),
  ('settlement.read', 'Settlement'),
  ('maintenance.access', 'Maintenance'),
  ('trip.create', 'Purchase Trips'),
  ('trip.read', 'Purchase Trips'),
  ('stock.transfer.create', 'Stock Distribution'),
  ('stock.transfer.read', 'Stock Distribution'),
  ('content.create', 'AI Studio'),
  ('content.review', 'AI Studio'),
  ('content.publish', 'AI Studio')
) as v(key, module)
where permissions.key = v.key;

-- Belt-and-suspenders: fail loudly if the backfill above missed a row (a permission
-- key seeded by some migration this one didn't account for), rather than silently
-- shipping a null-module row that would render oddly in the grouped UI.
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing from permissions where module is null;
  if v_missing > 0 then
    raise exception '% permission(s) have no module backfilled — update this migration', v_missing;
  end if;
end $$;

alter table permissions alter column module set not null;

comment on column permissions.module is
  'Display grouping for the admin Roles & Permissions screen, e.g. "Billing", '
  '"AI Studio". Required on every permission (enforced not null) — set explicitly at '
  'creation time, not parsed from the key.';

-- 2. is_system — protects the seeded roles/permissions everything else in the schema
-- (RLS policies, has_org_permission()/is_platform_admin(), resolveEntitlements) refers
-- to by exact name/key from being renamed or deleted through the admin UI. Does NOT
-- restrict role_permissions (grant/revoke) on a system role — only its own identity.
alter table roles add column is_system boolean not null default false;
alter table permissions add column is_system boolean not null default false;

update roles set is_system = true
where name in (
  'platform_admin', 'org_owner', 'org_manager', 'org_accountant',
  'store_sales_staff', 'store_cleaning_staff', 'store_temp_staff',
  'platform_editor', 'platform_content_lead'
);

update permissions set is_system = true
where key in (
  'org.create', 'store.create', 'staff.invite', 'staff.revoke', 'org.manage_members',
  'billing.write', 'billing.read', 'inventory.write', 'inventory.read',
  'reports.read', 'settlement.read', 'maintenance.access',
  'trip.create', 'trip.read', 'stock.transfer.create', 'stock.transfer.read',
  'content.create', 'content.review', 'content.publish'
);

comment on column roles.is_system is
  'True for the roles the seed migrations and hardcoded checks (is_platform_admin() '
  'specifically matches the name ''platform_admin'') depend on. Blocks rename/delete '
  'via RLS below — new roles created through the admin UI default to false and are '
  'freely editable.';

comment on column permissions.is_system is
  'True for permission keys referenced by string literal elsewhere (RLS policies, '
  'has_org_permission() calls, M-role-permission-model.md''s catalog). Blocks rename/'
  'delete via RLS below, same reasoning as roles.is_system.';

-- 3. Tighten roles'/permissions' write policies to respect is_system. Postgres has no
-- ALTER POLICY for changing a definition, so drop + recreate each one under its
-- existing name. `using` gates which existing rows an update/delete can touch; `with
-- check` (on insert/update) additionally blocks setting is_system = true client-side,
-- so a system role/permission can only ever be created by a migration (which runs as
-- the Postgres owner, bypassing RLS entirely) — never through the app.
drop policy if exists "platform admins can insert roles" on roles;
create policy "platform admins can insert roles" on roles
  for insert to authenticated
  with check (public.is_platform_admin() and not is_system);

drop policy if exists "platform admins can update roles" on roles;
create policy "platform admins can update roles" on roles
  for update to authenticated
  using (public.is_platform_admin() and not is_system)
  with check (public.is_platform_admin() and not is_system);

drop policy if exists "platform admins can delete roles" on roles;
create policy "platform admins can delete roles" on roles
  for delete to authenticated
  using (public.is_platform_admin() and not is_system);

drop policy if exists "platform admins can insert permissions" on permissions;
create policy "platform admins can insert permissions" on permissions
  for insert to authenticated
  with check (public.is_platform_admin() and not is_system);

drop policy if exists "platform admins can update permissions" on permissions;
create policy "platform admins can update permissions" on permissions
  for update to authenticated
  using (public.is_platform_admin() and not is_system)
  with check (public.is_platform_admin() and not is_system);

drop policy if exists "platform admins can delete permissions" on permissions;
create policy "platform admins can delete permissions" on permissions
  for delete to authenticated
  using (public.is_platform_admin() and not is_system);

-- 4. role_permissions had a SELECT policy (20260826000000) but no way to write it —
-- nothing has ever needed to grant/revoke a permission through the app until now. Not
-- is_system-gated: toggling which permissions a role holds is the entire point of the
-- matrix UI, for system roles included — only the role/permission's own identity
-- (name, scope_type, key) is protected above, not its grants. A FK (role_id/
-- permission_id, both not null, no cascade) already blocks deleting a role or
-- permission that still has grants, so no extra guard is needed for that case.
create policy "platform admins can grant role permissions" on role_permissions
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform admins can revoke role permissions" on role_permissions
  for delete to authenticated
  using (public.is_platform_admin());
