# M-admin-org-module — What's Actually Built (Admin Console + Org Portal)

**Status:** Living reference — describes the real, shipped UI/routes/flows, not a spec to build toward
**Parent docs:** `M1b-Core-Tenancy-Schema.md` (the roles/permissions mechanism this UI sits on top of), `M-role-permission-model.md` (the permission catalog), `constitution.md` v1.7.0 §5 (M1 Phase 3 — this is that phase's UI)
**Version:** 1.0.0

---

## 0. Why this doc exists

Every other `M1*` doc in this set is a spec written *before* the corresponding code —
what should get built. This one is the opposite: a description of what's actually
running today in `tallythreads-web`, written after the fact, so a reader (human or AI
agent) can find "what does the admin console actually do right now" in one place
instead of reconstructing it from `git log` or by clicking through the app. Update this
doc when the shape of these screens changes materially — a new section, a new shell, a
new cross-cutting mechanism like the area switcher below — not for every small UI tweak.

---

## 1. The three shells

Three top-level route trees exist, each with its own sidenav shell component. There is
**no shared layout** between them beyond a common visual language (Tailwind tokens,
`Logo`, `ThemeToggle`) — each shell is its own React component with its own `<Outlet/>`.

| Shell | Component | Mounted at | Who lands here (via `resolvePostSignInPath`) |
|---|---|---|---|
| Admin console | `AdminShell` (`src/features/admin/AdminShell.tsx`) | `/admin` | `platform_admin` |
| Organization portal | `OrgPortalShell` (`src/features/org/OrgPortalShell.tsx`) | `/org` | Any member with ≥1 org-scoped membership (`org_owner`/`org_manager`/`org_accountant`) |
| Store operations | `AppShell` (`src/components/AppShell.tsx`) | `/app` | Everyone else, and reachable by anyone signed in — see §4's caveat |

`resolvePostSignInPath` (`src/features/auth/resolvePostSignInPath.ts`) picks exactly one
of `/admin`, `/org`, `/no-store` right after sign-in, based on `resolveEntitlements`.
That decision only runs once, at sign-in — see §4 for how a member reaches the *other*
areas they hold access to afterward.

All three shells share the same header pattern: avatar + name (left), then a
right-hand cluster of controls (area switcher, theme toggle, sign-out). `AuthGuard`
(`src/features/auth/AuthGuard.tsx`) protects all three route trees identically — it only
checks `isSignedIn`, nothing role-specific. **RLS is the real authorization boundary**,
not client-side route gating (per `constitution.md` §6's identity/access separation
rule) — a signed-in member can navigate to any shell's URL directly; what they can
actually read or write once there is enforced by Postgres policies keyed off
`has_org_permission`/`is_platform_admin`, not by the router.

---

## 2. Admin console (`/admin`)

**Organizations** (`/admin/orgs`)
- `OrgListPage` → `OrgCards` — one card per organization, showing pending-invite count
- `OrgFormPage` (`/admin/orgs/new`) — creates an organization with up to N invited
  members in one submit; validates every invited role exists *before* inserting the
  org row (`resolveInviteRoleIds` — fail-closed, fixed after the "Test Org Alpha"
  partial-creation bug)
- `OrgEditPage` (`/admin/orgs/:orgId/edit`) — two sections:
  - `OrgMembersTable` — lists accepted memberships and pending invites for the org,
    with a status indicator per row
  - **Invite Member** — a collapsible form (email + role via `InputSelectGroup`) that
    calls `inviteOrgMember(organizationId, invite, invitedByMemberId)`
    (`fetchOrganizations.ts`) to invite one additional person into an *already-existing*
    organization; shows a "copy invite link" success row; invalidates both the org's
    members query and the admin org-list's pending-invites query on success

**Metadata** (`/admin/metadata`)
- `RoleListPage` / `PermissionListPage` — CRUD screens over the `roles` and
  `permissions` tables, each with a modal form (`RoleFormModal`/`PermissionFormModal`).
  This is the screen where the live-DB `org_accountant`→`org_stock_keeper` rename
  happened (an out-of-band edit that diverged from the seed migration — since restored;
  see `M-role-permission-model.md` §7 for context). **No guardrail yet** against
  renaming/deleting a "system" role name out from under the seed migrations — flagged
  once, not yet built (§6).

---

## 3. Organization portal (`/org`)

**Landing** (`/org` → `OrgPortalIndexPage`) — resolves the signed-in member's org
memberships (`fetchMyOrganizations`): exactly one org redirects straight to
`/org/:orgId/stores`; more than one shows a picker; zero orgs falls back to
`/no-store` (defensive — `resolvePostSignInPath` shouldn't route here with zero orgs,
but the page doesn't assume that invariant holds).

**Stores** (`/org/:orgId/stores`)
- `StoreListPage` — card list of the org's stores, "Add Store" button
- `StoreFormPage` (`/org/:orgId/stores/new`) — name + optional store code; calls
  `createStore(organizationId, values)` (`fetchStores.ts`)
- `store.create` is granted to **both** `org_owner` and `org_manager` — this was
  briefly narrowed to `org_owner`-only during the same session this shipped, then
  corrected via migration `20260826000700_restore_org_manager_store_create.sql` once
  `M1b-Core-Tenancy-Schema.md` §5 Phase 3 subtask 3's original design was checked (see
  that migration's own comment and `constitution.md` §8's 2026-08-26 changelog entry)
- No edit/delete action on a store yet — deferred along with store-level staff
  assignment (§6)

**RLS gate:** `has_org_permission(target_organization_id, permission_key)` — a
SECURITY DEFINER function added specifically for this (`20260826000600_stores_create_rls.sql`),
generic across every org-scoped permission key rather than hardcoding role names into
each policy. Mirrors `is_platform_admin()`'s existing pattern, parameterized.

---

## 4. Store operations (`/app`)

Billing/Inventory/Trips/Reports/Settings — all five pages are still one-line stubs
(`export default function BillingPage() { return <h1>...</h1> }`), predating M2
(offline sync engine, not started) and M3–M5 (the modules that would give these pages
real content). `AppShell`'s bottom tab bar and its route tree are real and functional;
the *content* behind each tab is not.

**Caveat worth being explicit about:** unlike `/admin` and `/org`, nothing currently
computes "should this member land in `/app`" — `resolvePostSignInPath` never routes
here, and `AuthGuard` doesn't check for a store-level membership before rendering it.
Any signed-in member who navigates to `/app` directly reaches it. This matches
`M1a-identity-auth.md`'s own scope note that RLS/route-gating for `/app`-scoped data is
a separate, later phase (M1e) — and practically doesn't matter much yet since the pages
have no real data to protect. Worth closing before M3/M5 give these pages real
read/write access to store data.

---

## 5. Cross-shell navigation — the header area switcher

**Added 2026-08-26.** Before this, a member who held access to more than one area
(e.g. a `platform_admin` who is *also* invited into an organization as `org_owner`) had
no way back to their other area except editing the URL by hand — `resolvePostSignInPath`
only fires once, at sign-in.

`AreaSwitcher` (`src/features/auth/AreaSwitcher.tsx`) is a small dropdown rendered in
every shell's header, right of the member's name/avatar and left of `ThemeToggle`. It
reads the same `useEntitlements()` hook every shell already uses, derives the member's
accessible areas via a pure helper (`getAccessibleAreas`, `src/features/auth/getAccessibleAreas.ts`),
and renders nothing if there's only one accessible area (nothing to switch to).

`getAccessibleAreas` mirrors `resolvePostSignInPath`'s own logic rather than
introducing a new permission concept:

| Area | Shown when | Destination |
|---|---|---|
| Admin | `entitlements.platformRole === "platform_admin"` | `/admin` |
| Organization | `entitlements.organizations.length > 0` | `/org/:firstOrgId/stores` |
| Store Ops | always, for any signed-in member | `/app` (see §4's caveat — this will likely need its own gate once `/app` has real data) |

This was scoped deliberately narrow: a dropdown reusing existing entitlements data, no
new backend endpoint, no new permission key. It answers the founder's ask ("give that
link as sidemenu toggle from header") without inventing a fourth shell or a
cross-shell "unified nav" redesign — if that's wanted later, this is the natural
extension point (`getAccessibleAreas` is already the single source of truth for "which
areas can this member reach").

---

## 6. Known gaps (deferred, not forgotten)

- **Store-level staff assignment** — inviting/assigning `store_sales_staff`/
  `store_temp_staff`/`store_cleaning_staff` (or the proposed, not-yet-built
  `store_manager` — `M-role-permission-model.md` §6) to a specific store. Explicitly
  scoped out of the store-creation pass that shipped this session.
- **Roles-metadata guardrail** — nothing stops an admin from renaming or deleting a
  "system" role (`org_owner`, `platform_admin`, etc.) from `/admin/metadata`, which is
  exactly what caused the `org_accountant`→`org_stock_keeper` live-DB divergence this
  session had to fix by hand. Offered once as a follow-up, not yet built.
- **`/app` route gating** — see §4.
- **Store edit/delete** — `StoreListPage` has no edit action yet (§3).

---

## 7. Changelog

- **v1.0.0 (2026-08-26)** — Initial version, written after the fact to document store
  creation (`/org` portal), the Invite Member flow on `OrgEditPage`, the
  `accept_pending_invitations()` RPC, and the new header area switcher — none of which
  had a doc describing the actual shipped UI/routes before this.
