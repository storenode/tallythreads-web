# TallyThreads — Build Status & Roadmap

**Updated:** 2026-09-05

The one place to see what's built and what's next. The full rationale/roadmap is
`constitution.md` §5; this is the short board on top of it. Detailed build logs for
completed work were removed on 2026-09-05 (the shipped code + `constitution.md` §8
changelog are the record) — see the note at the bottom.

---

## ✅ Foundation — complete

The foundation is done and working end-to-end:

1. **Google Login** — Google Sign-in → custom TallyThreads JWT (`members` table,
   `mint-member-session`).
2. **PIN setup** — per-device PIN enrollment + fast repeat login (`devices`, `set-pin`,
   `verify-pin`), offline-capable via Dexie session cache.
3. **Organizations** — create Individual / Chain / Franchise orgs (business model is
   *derived* from relationships, not a stored field — `../reference/schema.md` §5).
4. **Stores** — create stores under an organization.
5. **Members** — invite/onboard members at org and store scope (`store_invitations` →
   `memberships`).
6. **Roles + Permissions = Entitlements** — the `roles`/`permissions`/`role_permissions`
   RBAC model, `resolveEntitlements`/`hasPermission`, and RLS helpers
   (`is_platform_admin` / `has_org_permission` / `has_store_permission`). Catalog:
   `../reference/roles-and-permissions.md`.

**Current app surface:** an admin console (`src/features/admin/` — organizations, roles,
franchises, demo tooling), a stores area (`src/features/stores/`), and a store-scoped
Operations shell at `/ops/:storeId` (`src/features/operations/`) whose five tabs
(Billing, Inventory, Trips, Reports, Settings) are **stubs** — see below.

> Note: the React frontend was reset to the login/PIN/PostgREST base on 2026-08-29
> (`constitution.md` §8) and the Org/Stores/Members/Roles UI above was rebuilt after
> that. The underlying Supabase schema was never reset.

---

## 🔜 Next — Operations (Billing / Inventory / Trips / Reports / Settings)

The `/ops` tabs are one-line placeholders. What actually sits behind them is the module
roadmap below. **Sequencing rule (constitution §5): M2 offline-sync must be stable
before M3/M4/M5 begin in earnest.**

Franchise-specific note driving the current planning (Bandrip): the franchiser
(Bandrip Corporate) does the sourcing **Purchase-Trip** and distributes stock; a
franchise branch *receives* goods and owes a monthly **settlement**. So the branch's
Operations are billing/inventory/reports, not a Purchase-Trip.

| Module | Scope | Status |
|---|---|---|
| **M1c** | Stock locations/transfers, franchise linkage, goods-received-from-franchisor | Franchise **linkage + rule storage** live (`franchise_groups`/`franchise_memberships`/`settlement_rules`); stock-transfer flow + goods-received **not built** |
| **M1d** | **Franchise settlement engine** (`lib/franchiseSettlement.ts`) — hybrid recipe/plugin, money-critical, unit-tested | **Speced, not built.** Design + Nellore golden test in `../reference/franchise-settlement.md` v2.0.0 §4. No M2 dependency (pure logic) — buildable now |
| **M2** | Offline sync engine (Dexie ⇄ Supabase) | Not started — gates M3/M4/M5 |
| **M3** | Inventory, variant matrix, barcode | Permission keys seeded; no tables |
| **M4** | Purchase-Trip module (landed cost) — the core differentiator | Permission keys seeded; no tables |
| **M5** | Billing/POS, GST calc, printing | Permission keys seeded; no tables |
| **M6** | GST reports, GSTR export | Not started |
| **M7** | Settings, onboarding (incl. store GSTIN/address) | Not started |
| **M8 / M9** | PWA polish + shadow-mode verification; launch prep with Bandrip | Not started |
| **M10** | **Shift & Store Operations Log** — staff hours, petty-expense + approval, shift-handover notes (AI later) | **Speced, not built** (`shift-store-ops-log.md`). Store-facing differentiator; feeds M1d expenses; independent of M2–M5 (can start early, online-first) |

---

## Open decision — where to start Operations

Candidates (see `constitution.md` §5 for sequencing):
1. **M2 first** — correct foundation, least visible.
2. **M4 Purchase-Trip** — the product's core bet (Corporate sourcing), but skips M2.
3. **M1d Settlement** — money-critical, pure logic, already speced, no M2 dependency.
4. **M10 Shift & Store Ops Log** — store-facing differentiator (staff hours + petty
   expenses + shift notes), independent of M2–M5, and produces the store-expense data M1d
   consumes. Natural pairing: **M10 Phase 1 → M1d**.

Not yet decided — this is the roadmap conversation in progress.

---

## Doc set (after the 2026-09-05 cleanup + restructure)

Organized by purpose (see `../README.md` for the map): `constitution.md`;
`reference/{schema.md, roles-and-permissions.md, franchise-settlement.md}`;
`roadmap/{status.md (this file), workflow.md, future/ai-studio.md}`;
`journal/` (dated dev log). Root `CLAUDE.md` points here.

Removed (recoverable via git) — completed-work build logs and stale/duplicate docs:
`M0-foundation.md`, `M0.5-public-home-portal.md`, `M0.6-supabase-setup.md`,
`M1-auth-google.md`, `M1a-identity-auth.md`, `M1b-Core-Tenancy-Schema.md`,
`M1_Task_Plan.md`, `M1-core-tenancy-schema.md`, `Store_model_master_plan.md`,
`M-admin-org-module.md`. Their unique content was folded into the kept docs; their
history is in `constitution.md` §8.
