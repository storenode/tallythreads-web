# M1b — Core Tenancy, Roles & Entitlements

**Status:** 🔵 In Progress — Phase 1 (Schema) done 2026-08-22, Phase 2 (Entitlements/TDD) started 2026-08-22
**Version:** 2.0.0 (supersedes v1.1.0's admin-provisioned-store design; see Changelog)
**Est:** ~32.5 hrs (was 24h in v1.1.0 — see the hour reconciliation note in Changelog)
**Parent docs:** `M1-core-tenancy-schema.md`, `M1-schema-reference.md` §2, `M1a-identity-auth.md`,
`constitution.md` v1.4.0
**Depends on:** M1a (Tasks 1–2), confirmed live 2026-08-22 — real `members`/`devices`
rows exist with correct columns, hashes, and timestamps.
**Execution order:** three phases, in sequence — Schema → Entitlements (TDD) → UI.
Each phase is a hard prerequisite for the next; there's no useful parallelism here for
a solo developer.

---

## 0. What changed, in one paragraph

v1.1.0 had the platform admin create an organization and its first store together in
one action, gated by a `members.platform_role` column, with only two membership roles
(`owner`/`staff`). Working through a real onboarding case (SuperStyle Fashions — one
customer, an Owner/Manager/Accountant at the org level, sales/cleaning/temporary staff
at the store level) surfaced that this was too coarse. v2.0.0 splits admin
provisioning into "create the organization and its core contacts" (still admin-only)
and "create a store under that org" (now the org's own Owner/Manager, not the platform
admin), replaces the two-value role enum with a real roles/permissions model spanning
three scopes (platform, organization, store), and folds `platform_role` into that same
model instead of keeping it as a special-cased column — resolving an inconsistency
flagged directly in discussion.

---

## 1. The role model

**Three scopes, one mechanism.** Every grant of access — from the platform admin down
to a single store's temporary staff — is one row in `memberships`, differing only in
which scope it's assigned at and which role it carries. One `resolveEntitlements`/
`hasPermission` function (Phase 2) is the only code that ever interprets these rows.

**Platform scope** (`organization_id` null, `store_id` null) — assigned by an existing
platform admin, not tied to any customer:

| Role | Can do |
|---|---|
| `platform_admin` | Everything — provision organizations, seed further platform-level roles |
| *(named now, not seeded yet)* `platform_editor` | Future — create/publish promotional content for stores they're individually assigned to (a store-scoped row, see §1.3 below) |
| *(named now, not seeded yet)* `platform_content_lead` | Future — assigns editors to stores, reviews their output |

**Organization scope** (`organization_id` set, `store_id` null) — access cascades to
every store under that org, present and future, with no separate per-store row:

| Role | Can do |
|---|---|
| `org_owner` | Everything within the org: create stores, add/remove Manager & Accountant, full financial visibility |
| `org_manager` | Create stores, invite/manage store-level staff, operate any store in the org |
| `org_accountant` | Read-only — reports and settlement statements only. No billing/inventory detail, no staff management, can't create a store |

**Store scope** (`store_id` set, `organization_id` null) — scoped to exactly one store:

| Role | Can do |
|---|---|
| `store_sales_staff` | Normal billing/POS/inventory operational access |
| `store_temp_staff` | Same access as sales staff; ends by manual revoke (no auto-expiry — confirmed not needed) |
| `store_cleaning_staff` | Real signed-in account (Gmail + PIN), scoped to a maintenance-related screen only — no billing, no reports. Exact screen content is a later decision, not blocking this phase |

**§1.3 — why the Editor case doesn't need a fourth mechanism.** A platform-side editor
assigned to five stores across unrelated organizations is structurally identical to a
`store_sales_staff` row: `organization_id` null, `store_id` set to the target store.
`resolveEntitlements` doesn't care *why* a member has a store-scoped row, only that
they have one — an editor resolves exactly like staff would, just carrying a
different role (and therefore a different permission bundle: content creation/
publishing instead of billing/inventory). No schema change needed later beyond
seeding `platform_editor` into `roles` when that module — the still-deferred "AI
Studio" work, constitution §3, P2+ — actually gets built. Per-video billing to a
store is a separate future concern (store-facing billing), not RBAC, not touched here.

---

## 2. Schema (reference — full DDL lands in Phase 1)

```sql
create table permissions (
  id    uuid primary key default gen_random_uuid(),
  key   text unique not null
  -- 'org.create', 'store.create', 'staff.invite', 'staff.revoke',
  -- 'billing.write', 'billing.read', 'inventory.write', 'inventory.read',
  -- 'reports.read', 'settlement.read', 'maintenance.access', 'org.manage_members'
);

create table roles (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  -- 'platform_admin' (seeded now); 'org_owner','org_manager','org_accountant',
  -- 'store_sales_staff','store_cleaning_staff','store_temp_staff' (seeded now);
  -- 'platform_editor','platform_content_lead' (named, NOT seeded — future AI Studio)
  scope_type  text not null check (scope_type in ('platform','organization','store'))
);

create table role_permissions (
  role_id        uuid not null references roles(id),
  permission_id  uuid not null references permissions(id),
  primary key (role_id, permission_id)
);

-- One table for every scope. platform_admin rows: both FKs null. Org-level rows:
-- organization_id only. Store-level rows (staff AND, later, platform-side editors):
-- store_id only. Validity of the FK combination for a given role is enforced by the
-- functions that write this table (each only ever writes the combination its own
-- role's scope_type allows) — not by a plain column check constraint, which can't
-- reference another table's data.
create table memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id),
  role_id           uuid not null references roles(id),
  organization_id   uuid references organizations(id),
  store_id          uuid references stores(id),
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

alter table stores add column organization_id uuid not null references organizations(id);
```

`store_invitations` gains support for org-scoped invites (not just store-scoped) —
see Phase 1, subtask 6 for the two candidate shapes and why this is a real design
choice, not a trivial add. `access_grants` and `channels` are unchanged from
`M1-core-tenancy-schema.md` §2.

**Note on `access_grants`:** v1.1.0's Task 3 included seeding the founder's own
Platform Owner access as an `access_grants` row. That's no longer needed —
`platform_admin` now has universal reach via `resolveEntitlements` itself, so a
separate cross-tenant grant for the founder would be redundant. `access_grants`
remains exactly what it was for everyone else: franchisor visibility into a
franchisee, and any future read-only party (accountant/auditor) that isn't already
covered by the roles above.

---

## 3. Phase 1 — Schema changes (~13.5h) — ✅ DONE (2026-08-22)

**Delivers:** every table above, migrated; the ER diagram updated to match; the
platform-admin bootstrap seed prepared and run against the two real accounts below.

| # | Subtask | Hours |
|---|---|---|
| 1 | `organizations` table migration | 0.5 |
| 2 | `roles`/`permissions`/`role_permissions` tables + seed data — `platform_admin` plus the six org/store roles in §1; `platform_editor`/`platform_content_lead` named in comments only, not seeded | 2.5 |
| 3 | `memberships` table migration (`role_id` FK, old `role text`/check-constraint dropped) | 1.0 |
| 4 | `stores` migration: add `organization_id` — backfill one org per existing store if the table isn't empty before the `not null` constraint applies | 0.5 |
| 5 | `store_invitations` migration: generalize to support an org-scoped invite alongside the existing store-scoped one (see Open Questions §7 for the two candidate shapes) | 1.0 |
| 6 | `channels` and `access_grants` table migrations (unchanged from `M1-core-tenancy-schema.md` §2) | 1.0 |
| 7 | Cleanup migration: drop `members.platform_role` once Task 0's seed (below) and Phase 2's entitlements function are both confirmed working — real cleanup, not silently dropped without note | 0.5 |
| 8 | **Task 0 — bootstrap the two known platform admins.** Manual, one-time, run directly in the Supabase SQL editor — never through app code (see exact SQL below) | 0.5 |
| 9 | Regenerate the schema ER diagram (`M1-schema-diagram.svg`) to reflect `roles`/`permissions`/`role_permissions`, `memberships.role_id`, and the dropped `members.platform_role` column | 1.5 |
| 10 | Testing: every migration applies cleanly to a copy of the real database (the one with the two real members below already in it); rollback tested for each | 3.0 |
| 11 | Buffer for `store_invitations` generalization fallout (whichever shape is chosen in subtask 5 touches Phase 3's invite functions too) | 1.5 |

### Task 0 — Bootstrap seed (the two real accounts)

Both of these already exist in the live `members` table, `platform_role` currently
`null` on both:

| Email | `members.id` |
|---|---|
| `obulareddyveera@gmail.com` (founder) | `95792411-9327-4ff6-bae9-91ef35bdc72f` |
| `storenode.hq@gmail.com` | `f8064f9c-f5c0-4d3c-9282-9bd2716d6042` |

Run once, after subtask 2 above has seeded the `roles` table (needs the
`platform_admin` role to exist first):

```sql
-- Seeds both known platform admins as memberships rows (org/store both null).
-- Safe to re-run — the NOT EXISTS guard prevents duplicate rows since there's no
-- unique constraint on (member_id, role_id) alone.
insert into memberships (member_id, role_id)
select m.id, r.id
from members m
cross join (select id from roles where name = 'platform_admin') r
where m.id in (
  '95792411-9327-4ff6-bae9-91ef35bdc72f',  -- obulareddyveera@gmail.com
  'f8064f9c-f5c0-4d3c-9282-9bd2716d6042'   -- storenode.hq@gmail.com
)
and not exists (
  select 1 from memberships existing
  where existing.member_id = m.id and existing.role_id = r.id
);
```

No migration, Edge Function, or client route ever runs this insert — it's a manual
step by whoever has direct Supabase access, which is what keeps platform-admin status
impossible to self-grant through the app.

### Definition of Done — Phase 1
- [ ] All tables above exist with the constraints/FKs described; `memberships` has no
      leftover check constraint requiring a non-null org or store FK
- [ ] Both real accounts above have a `platform_admin` `memberships` row; no other
      member does
- [ ] `M1-schema-diagram.svg` reflects the new tables and the dropped column
- [ ] `members.platform_role` is dropped (subtask 7) — but only after Phase 2 ships
      and is confirmed reading from `memberships` correctly, not before

---

## 4. Phase 2 — TDD: the entitlements function (~10h) — 🔵 IN PROGRESS (started 2026-08-22)

**Delivers:** one function, `resolveEntitlements(memberId)`, that every other piece of
the app calls — the client on load (to decide what to render), and every mutating
Edge Function (to decide whether to allow the action). Written test-first: the test
suite below is the executable spec for the whole role model in §1.

**Contract:**
```ts
resolveEntitlements(memberId: string): {
  platformRole: 'platform_admin' | null
  organizations: Array<{ organizationId: string, role: 'org_owner'|'org_manager'|'org_accountant' }>
  stores: Array<{ storeId: string, role: string, via: 'direct' | 'org_cascade' }>
}

hasPermission(memberId: string, permission: string, scope: { organizationId?: string, storeId?: string }): boolean
```

`hasPermission` is what every Edge Function actually calls to authorize itself.
`resolveEntitlements` is what the client calls once on load, to decide what to show —
**never treated as the authorization boundary itself.** A cached client-side snapshot
answers "should I show this button," not "is this action allowed" — every mutating
function re-derives its own answer from the same underlying logic.

| # | Subtask | Hours |
|---|---|---|
| 1 | Test suite, written first, no implementation yet — see scenario list below | 3.0 |
| 2 | `resolveEntitlements` implementation: platform row lookup, org-scoped rows, store-scoped rows, org→store cascade | 2.5 |
| 3 | `hasPermission` implementation, built on top of `resolveEntitlements` (or its own direct query — implementation detail, same contract either way) | 1.5 |
| 4 | Wire `requirePlatformAdmin`'s old callers (from the v1.1.0-era draft) over to `hasPermission(member, 'org.create', {})` | 1.0 |
| 5 | Coverage pass: this lives in `src/lib` alongside `gstCalc.ts`, under the same ≥90% coverage gate from `vite.config.ts` (Constitution §2.V's discipline extended to access logic, not just money logic) | 1.0 |
| 6 | Client-side hook (`useEntitlements()` or equivalent) that calls `resolveEntitlements` once per session and caches the snapshot for UI decisions | 1.0 |

**Test scenarios (write these before the implementation exists):**
1. `org_owner` reaches a store they never personally created, purely via org cascade.
2. `org_accountant` is denied `store.create` even though they're a real org member.
3. A store-scoped role (any of the three) resolves correctly with **zero** org
   affiliation — proves the Editor case from §1.3 without needing Editor seeded yet.
4. A revoked `memberships` row (soft-deleted) no longer grants access on the next call.
5. `platform_admin` passes every permission check, at every scope, including one
   with no prior org/store relationship at all.
6. A member with zero `memberships` rows resolves to "nothing" cleanly — no error,
   no accidental default access.
7. Two roles on the same member at different scopes (e.g. `org_owner` at Org A,
   `store_sales_staff` at a store under an unrelated Org B) resolve independently —
   one doesn't leak permissions into the other.

### Definition of Done — Phase 2
- [ ] All seven scenarios above pass as automated tests, written before the
      corresponding implementation code (verify via commit order, not just that
      tests exist)
- [ ] `src/lib` coverage for this module ≥ 90%, enforced by the existing CI gate
- [ ] No Edge Function anywhere checks `members.platform_role` or a raw `role`
      string directly — every check goes through `hasPermission`

---

## 5. Phase 3 — UI: organization + store creation, staff management (~9h)

**Delivers:** the actual end-to-end features — admin provisioning an organization,
an org Owner/Manager creating a store, and staff invitations at the store level —
each calling Phase 2's function to decide what to show and what to allow.

| # | Subtask | Hours |
|---|---|---|
| 1 | `provision-organization` Edge Function (`hasPermission` gate: platform scope): creates `organizations` row, invites Owner/Manager/Accountant by email using the generalized `store_invitations` | 1.5 |
| 2 | `/admin/new-organization` UI: org name + up to 3 emails (Owner/Manager/Accountant) | 1.0 |
| 3 | `create-store` Edge Function (`hasPermission` gate: `org_owner`/`org_manager` at the target org): creates the `stores` row, default `pos` channel row | 1.5 |
| 4 | "Add a store" client UI, visible to Owner/Manager once they've accepted their org invite | 1.0 |
| 5 | Invite-send/accept/revoke functions, generalized for the three store-level roles (sales/cleaning/temporary) and reusing the same accept/revoke mechanics from the original design | 1.5 |
| 6 | "Staff" screen: role picker (Sales / Cleaning / Temporary), list + invite/revoke actions | 1.0 |
| 7 | Client: passive "you haven't been added yet" page for a member with zero memberships and no pending invitation | 0.5 |
| 8 | Testing: full path — admin provisions org → Owner/Manager accepts → creates store → invites each of the three staff roles → revokes one → rejoin scenario | 1.5 |

### Definition of Done — Phase 3
- [ ] You can go from "new customer conversation" to a working store with staff
      invited, entirely through the UI, with every gate enforced server-side (verified
      by calling functions directly, not just hiding buttons)
- [ ] `org_accountant` cannot create a store or invite staff — attempted via direct
      function call, not just absent from their UI
- [ ] `store_business_model` (unchanged from `M1-core-tenancy-schema.md` §4) correctly
      resolves `independent`/`chain` once a second store is added to an org

---

## 6. Manual Test Plan

**A. Bootstrap and org provisioning**
1. Confirm both real accounts (`obulareddyveera@gmail.com`, `storenode.hq@gmail.com`)
   resolve `platformRole: 'platform_admin'` from `resolveEntitlements` after Task 0's
   seed runs.
2. As a platform admin, provision "SuperStyle Fashions" with Owner/Manager/Accountant
   emails → confirm one `organizations` row and three pending `store_invitations`.
3. A non-admin member attempts the same call directly → fails server-side.

**B. Store creation**
4. Manager accepts their invite, creates the HSR Bangalore store → confirm exactly
   one `stores` row (`organization_id` set) and one `pos` channel row.
5. Owner attempts the same → succeeds. Accountant attempts the same → fails
   server-side, not just hidden in UI.
6. Confirm Owner and Manager can act on the new store **without any new membership
   row for them** — proves the org-cascade, not a per-store copy.

**C. Staff invitations, all three roles**
7. Manager invites one email each as Sales, Cleaning, and Temporary → three
   `store_invitations` rows, correct `role_id` each.
8. Each accepts → three `memberships` rows at `store_id`, correct roles.
9. Revoke the Temporary staff member → immediate PIN/sign-in lockout, matching the
   existing revoke mechanics.
10. Re-invite the same revoked email → accepts cleanly, no stale-state block.

**D. Entitlements correctness (Phase 2's own test suite, exercised end-to-end here)**
11. Confirm the seven scenarios in §4 all still hold against the real, populated
    database, not just in isolated unit tests.

---

## 7. Open questions

1. **`store_invitations` generalization shape** (Phase 1, subtask 5): a nullable
   `organization_id` column alongside the existing `store_id`, or the same
   `scope_type`/`scope_id` pattern `access_grants` already uses? The latter is more
   internally consistent; the former is a smaller diff. Your call before Phase 1
   subtask 5 is implemented.
2. **Can an `org_owner` remove another `org_owner`?** Drafted as yes (symmetric)
   for now — flag if you want exactly one "senior" Owner with special standing.
3. **Can `org_manager` remove `org_accountant` or a fellow `org_manager`?** Drafted
   as Owner-only for removing org-level roles; Manager can only manage store-level
   staff. Flag if that's wrong.
4. **`storenode.hq@gmail.com`** — seeded as a second `platform_admin` per your
   instruction. Worth a one-line note for your own records on what this account is
   for (shared HQ login, a co-founder, a test account), purely so it isn't a mystery
   entry in `memberships` a year from now — not a blocking question.

---

## 8. Changelog

- **v2.0.0 (2026-08-22)** — Full rework from v1.1.0, driven by working through a real
  onboarding case (SuperStyle Fashions) rather than a hypothetical. Three changes:
  (1) organization provisioning (admin-only, unchanged authority) is now separate from
  store creation (now the org's own Owner/Manager, gated by the entitlements function,
  not a self-serve free-for-all — access to create a store still requires an
  admin-issued org membership first); (2) the two-value `owner`/`staff` role enum
  becomes a real `roles`/`permissions`/`role_permissions` model spanning platform,
  organization, and store scope, replacing the separate `members.platform_role`
  column with a `memberships` row like everything else, closing an inconsistency
  flagged directly in discussion; (3) execution is restructured into three phases —
  Schema, a TDD-built `resolveEntitlements`/`hasPermission` function as the single
  source of truth for the whole app, and UI — rather than the five-task shape v1.1.0
  used. Seeded both known platform-admin accounts by real `members.id` as part of
  Phase 1. Hour estimate revised from 24h to ~32.5h — the increase is real work
  (roles/permissions schema, the entitlements function and its test suite, the
  org-vs-store provisioning split), not padding; needs folding into
  `M1-task-plan.md`'s M1 total and `constitution.md`'s project total next.
- **v1.1.0 (2026-08-22)** — Reworked Task 1 from a self-serve "create my store" flow
  to admin-provisioned onboarding. Superseded by v2.0.0 above.
- **v1.0.0** — Initial task spec (self-serve store creation). Superseded.
