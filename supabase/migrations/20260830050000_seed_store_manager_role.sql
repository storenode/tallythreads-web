-- Adds store_manager (store scope) — the clearest gap surfaced by checking the role
-- model against real Indian retail store operations: almost every outlet beyond a
-- one-person shop has someone in charge of THAT specific store (day-end cash
-- reconciliation, local stock calls, supervising billing staff), distinct from
-- org_manager, who oversees every store in the org. Proposed but deliberately
-- deferred in M-role-permission-model.md §6 ("not built — the deferred follow-up") —
-- seeding it now revisits that deferral, per the 2026-08-30 business-fit review
-- (see that doc's changelog for the full reasoning).
--
-- Grants: the same operational set store_sales_staff/store_temp_staff already have
-- (billing + inventory, read/write) — a store manager can do everything counter staff
-- can. Two things deliberately withheld:
--   - staff.invite/.revoke: §6's sketch wants this scoped to the manager's own store
--     only (sales/cleaning/temp staff, never another store or an org-level role), but
--     the real store-level staff-invite feature that would enforce that scoping
--     doesn't exist yet (M-role-permission-model.md §3: "still no general store-level
--     invite UI"). Granting it now would be a no-op today and a silent overgrant the
--     moment that feature ships without this scoping decision being revisited
--     alongside it — so it waits.
--   - reports.read: §6 already leaned "no" here, symmetric with org_manager not
--     having settlement.read — financial visibility stays org-level
--     (org_owner/org_accountant), not duplicated down to every store.
insert into roles (name, scope_type, is_system) values
  ('store_manager', 'store', true)
on conflict (name) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('billing.write', 'billing.read', 'inventory.write', 'inventory.read')
where r.name = 'store_manager'
on conflict do nothing;
