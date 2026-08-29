# M-role-permission-model — The Full Role & Permission Catalog

**Status:** Living reference, consolidates decisions already made elsewhere
**Parent docs:** `M1b-core-tenancy.md` §1–2 (the platform/organization/store mechanism
this all runs on), `constitution.md` v1.8.0 §2.IX/§3/§5, `store-model-master-plan.md`,
`M1-franchise-model.md`, `M-ai-studio.md`
**Version:** 1.2.0

---

## 0. Why this doc exists

`M1b-core-tenancy.md` §1 already defines the mechanism (one `memberships` row per
grant, three scopes, one `resolveEntitlements`/`hasPermission` function) and the roles
that existed when it was written. What it doesn't do is enumerate every permission key
each module needs, module by module, in one place — that's scattered across
`store-model-master-plan.md`, `M1-franchise-model.md`, and conversation. This doc is
that single table: every role, every permission key, which roles have which
permissions, and — critically — **which of this is actually enforced today versus
seeded ahead of schema that doesn't exist yet.** Nothing here changes the mechanism;
it's the missing index over what's already been decided plus what got decided in this
pass (store creation opened to `org_manager` too, Purchase Trips/Stock
Distribution/AI Studio permission keys seeded ahead of their real tables).

---

## 1. Build-status legend

Every row below is tagged with one of three statuses, because "the role exists" and
"the role actually does something" are different claims:

- **Live** — a real table, RLS policy, and (usually) UI exist. Signing in as this role
  and attempting the action produces a real result, allowed or denied.
- **Seeded** — the `roles`/`permissions`/`role_permissions` rows exist (so
  `resolveEntitlements`/`hasPermission` already answer correctly for it), but no table
  or RLS policy references the permission key yet — there's nothing to gate. Safe and
  cheap to have ahead of time; the module's own migration is what turns this into
  Live, not a role/permission change.
- **Named** — mentioned in a spec doc, not in the database at all. Zero cost, zero
  effect, purely a placeholder so the eventual name isn't invented fresh later.

## 2. Roles, by scope

| Role | Scope | Status | What it's for |
|---|---|---|---|
| `platform_admin` | platform | Live | Everything, everywhere — provisions organizations, manages platform metadata (roles/permissions screens), universal read/write via `is_platform_admin()` |
| `platform_editor` | platform | Seeded (2026-08-26) | AI Studio: drafts content (`content.create`) for stores they're assigned to — a store-scoped `memberships` row per M1b §1.3, same mechanism as store staff |
| `platform_content_lead` | platform | Seeded (2026-08-26) | AI Studio: reviews and publishes editors' drafts (`content.review`, `content.publish`), also drafts directly |
| `org_owner` | organization | Live | Everything within the org: create stores, invite/remove Owner/Manager/Accountant, full financial visibility (`settlement.read`, `org.manage_members`) |
| `org_manager` | organization | Live | Create stores (restored 2026-08-26 — see §7), invite/manage store-level staff, operate any store in the org. No `settlement.read`, no `org.manage_members` |
| `org_accountant` | organization | Live | Read-only: `reports.read`, `settlement.read` only |
| `store_manager` | store | **Named, not seeded** | Not yet built — the deferred "assign a Manager to a store" follow-up. Proposed shape below (§6), not a decision |
| `store_sales_staff` | store | Live (role/permissions only — POS UI is M5, not built) | `billing.write/read`, `inventory.write/read` |
| `store_temp_staff` | store | Live (same caveat) | Identical access to `store_sales_staff`; differs only in that revocation is manual, no auto-expiry |
| `store_cleaning_staff` | store | Live (same caveat) | `maintenance.access` only |

## 3. Permission keys, by module

| Key | Module | Status | Notes |
|---|---|---|---|
| `org.create` | Tenancy | Live | Platform admin only |
| `store.create` | Tenancy | Live | `org_owner` + `org_manager` (restored 2026-08-26, see §7) |
| `staff.invite` / `staff.revoke` | Tenancy | Seeded — still no *general* store-level invite UI (org-level invite via Invite Member exists). **Narrow exception (2026-08-28):** the admin-only Demo Data module (`src/features/admin/demo/`) can send store-scoped invites, but only for the self-franchised demo organizations it manages — not a real staff-invite screen for any org. See §7's 2026-08-28 entry | `org_owner`, `org_manager` |
| `org.manage_members` | Tenancy | Seeded — no UI yet | `org_owner` only |
| `inventory.write` / `inventory.read` | Inventory (M3) | Seeded — no `products`/stock tables yet | `org_owner`, `org_manager`, `store_sales_staff`, `store_temp_staff` |
| `billing.write` / `billing.read` | POS/Billing (M5) | Seeded — no `invoices` table yet | `org_owner`, `org_manager`, `store_sales_staff`, `store_temp_staff` |
| `reports.read` | Reports (M6) | Seeded — no reports built yet | `org_owner`, `org_manager`, `org_accountant` |
| `settlement.read` | Franchise settlement (`M1-franchise-model.md`) | **Partially Live (2026-08-27)** — now gates real RLS on `franchise_groups`/`franchise_memberships`/`settlement_rules` (franchise linkage + rule *storage*, `20260827000000_m1c_franchise_linkage.sql`); the `settlement_statements` table (evaluated settlement results) and M1d's rule engine (`lib/franchiseSettlement.ts`) are still not built — see `constitution.md` v1.8.0 §8's 2026-08-27 entry | `org_owner`, `org_accountant` |
| `maintenance.access` | Store ops | Seeded — no maintenance screen yet | `store_cleaning_staff` only |
| `trip.create` / `trip.read` | Purchase Trips (M4) | **Seeded 2026-08-26** — no `trips`/landed-cost tables yet | `org_owner`, `org_manager` |
| `stock.transfer.create` / `stock.transfer.read` | Stock Distribution (M1c, `store-model-master-plan.md` §1) | **Seeded 2026-08-26** — no `stock_locations`/`stock_transfers` tables yet | `org_owner`, `org_manager` |
| `content.create` | AI Studio (`M-ai-studio.md`) | **Seeded 2026-08-26** — no content tables yet | `platform_editor`, `platform_content_lead` |
| `content.review` / `content.publish` | AI Studio | **Seeded 2026-08-26** | `platform_content_lead` only |

## 4. Full matrix

✓ = granted. Blank = not granted. `platform_admin` omitted — it passes every check
unconditionally via `hasPermission`'s scope-agnostic platform_admin short-circuit
(`entitlements.ts`), not via `role_permissions` rows.

| Permission | org_owner | org_manager | org_accountant | store_sales/temp_staff | store_cleaning_staff | platform_editor | platform_content_lead |
|---|---|---|---|---|---|---|---|
| `org.create` | | | | | | | |
| `store.create` | ✓ | ✓ | | | | | |
| `staff.invite` / `.revoke` | ✓ | ✓ | | | | | |
| `org.manage_members` | ✓ | | | | | | |
| `inventory.write` / `.read` | ✓ | ✓ | | ✓ | | | |
| `billing.write` / `.read` | ✓ | ✓ | | ✓ | | | |
| `reports.read` | ✓ | ✓ | ✓ | | | | |
| `settlement.read` | ✓ | | ✓ | | | | |
| `maintenance.access` | | | | | ✓ | | |
| `trip.create` / `.read` | ✓ | ✓ | | | | | |
| `stock.transfer.create` / `.read` | ✓ | ✓ | | | | | |
| `content.create` | | | | | | ✓ | ✓ |
| `content.review` / `.publish` | | | | | | | ✓ |

## 5. What's actually enforced today vs. designed-ahead

Everything in the matrix resolves correctly through `resolveEntitlements`/
`hasPermission` right now — that function doesn't care whether a table exists, it just
answers "does this role have this permission." What's genuinely missing for the
Seeded rows is the other half: an RLS policy on a real table, and UI that calls it.
That's deliberate, not a gap to rush — `constitution.md` §5's sequencing rule is that
M3 (Inventory)/M4 (Purchase Trips)/M5 (POS) don't start in earnest until M2 (offline
sync) is stable, and M2 hasn't started. Seeding the permission model now means that
whenever each module's real build begins, the access-control design question is
already answered — the module's own migration just needs an RLS policy shaped like
`has_org_permission(organization_id, 'trip.create')`, the exact pattern
`20260826000600_stores_create_rls.sql` already established for `store.create`.

`settlement.read` is the one row that moved partway to Live outside that sequencing,
by exception rather than reordering — see §7's 2026-08-27 entry. `staff.invite`'s
demo-scoped UI (§7's 2026-08-28 entry) is the same kind of narrow exception, not a
signal that the real store-staff-invite screen is next in the sequence.

## 6. Proposed `store_manager` role (not built — the deferred follow-up)

Flagged for when store-level staff assignment gets built (explicitly deferred after
store creation shipped this session). Sketch, not a locked decision:

A `store_manager` would sit between `org_manager` (whole-org reach) and
`store_sales_staff` (day-to-day counter operation) — someone an Owner/Manager places
in charge of *one specific store*: `staff.invite`/`.revoke` scoped to that store only
(inviting sales/cleaning/temp staff, not other managers), plus everything
`store_sales_staff` already has. Mechanically this is a `store_id`-scoped
`memberships` row like any other store role — no new mechanism, same as the Editor
case in `M1b-core-tenancy.md` §1.3. Open question worth resolving before building it:
should a `store_manager` see that store's `reports.read`, or does financial visibility
stay org-level-only (`org_owner`/`org_accountant`)? Drafted leaning toward "no" for
now, symmetric with `org_manager` not having `settlement.read` — flag if that's wrong.

## 7. Changelog

- **2026-08-28 — Demo Data admin module adds a narrow, demo-scoped store-invite
  UI.** `src/features/admin/demo/` (reachable from AdminShell's sidenav) lets a
  platform admin create and re-create self-franchised demo organizations —
  org + stores + franchise group + settlement terms + org-level invites — from the
  app instead of hand-running SQL (`seed-bandrip-demo.sql` and friends). Each store
  card there also has an "+ Invite Staff" action that writes a store-scoped
  `store_invitations` row (`store_sales_staff`/`store_temp_staff`/
  `store_cleaning_staff`), which is technically the first store-level invite UI to
  exist — but it only ever targets stores this module itself created, not a general
  staff-management screen for any organization. `staff.invite`'s status row above is
  updated to reflect this narrow exception, not a status change to Live. No schema,
  role, or permission changed — this is UI built directly on the RLS/schema
  `20260827000000_m1c_franchise_linkage.sql` and the existing `store_invitations`
  table already supported.
- **2026-08-27 — `franchise_groups`/`franchise_memberships`/`settlement_rules` move to
  Live (linkage + storage only).** `20260827000000_m1c_franchise_linkage.sql` migrated
  these three tables plus the `store_business_model` derived view for real, gated by
  the same `settlement.read` permission this doc already had seeded for `org_owner`/
  `org_accountant`. Driven by building a genuine demo organization ("Bandrip Demo")
  that needed a real franchisor/franchisee relationship — see `constitution.md` v1.8.0
  §8. This is `M1-task-plan.md`'s already-budgeted M1c "Franchise linkage" subtask
  pulled forward, not a new decision. Does **not** cover M1c's other two subtasks
  (stock locations/transfers, goods-received-from-franchisor) or M1d (the settlement
  rule engine that evaluates `settlement_rules.config` against real revenue) — both
  remain Seeded/unbuilt exactly as before.
- **2026-08-26 — Initial version.** Consolidates the existing M1b role model with:
  (1) `store.create` restored to `org_manager` (the previous "org_owner only" pass
  session had chosen turned out narrower than `M1b-core-tenancy.md` §5 Phase 3
  subtask 3's own original design — a correction, not a new decision); (2) permission
  keys seeded for Purchase Trips and Stock Distribution, ahead of their real schema,
  per the "design now, build in sequence" call; (3) `platform_editor`/
  `platform_content_lead` seeded for the first time, following `constitution.md`
  v1.6.0's amendment bringing AI Studio into scope — see `M-ai-studio.md`; (4) the
  proposed (not built) `store_manager` role documented for the still-deferred
  store-staff-assignment follow-up.
