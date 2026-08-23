# M1 Task Plan — Identity, Tenancy, Franchise, RLS

**Basis:** everything designed across this conversation, consolidated against
`constitution.md` v1.3.0, `M1-auth-google.md`, `M1a-identity-auth.md`,
`M1-core-tenancy-schema.md`, `M1-franchise-model.md`, `M1-schema-reference.md`.
**Pace assumption:** solo developer, ~10 hrs/week (constitution §1).
**Starting point:** 2026-08-21.

---

## Headline number

**~115 hours, ~11–12 weeks** at 10 hrs/week — against the constitution's original M1
line item of **18 hours**. That gap is real, not a rounding issue: the original 18h
assumed phone OTP and a bare schema; what's actually been designed since is Google
Sign-in + custom JWT, device-gated PIN login, a full multi-tenant organization/store
model, invite-based staff onboarding, a generic cross-tenant access primitive, central
stock distribution, franchise linkage, and a settlement rule engine — each with its own
real engineering and testing cost. See the note at the end on what this does to the
320-hour total roadmap.

**Reconciled 2026-08-22:** `M1a-identity-auth.md` v1.5.0 added Task 3 (Sign In / Sign
Up split, unified login page, Remember Me — 4.5h) after this plan's phase table was
first written, which had been carried as an un-folded +4.5h delta for a time. That's
now folded in below: M1a is 26.5h (was 22h), M1's total is 106.5h (was 102h), and
`constitution.md`'s M1 line item and 404h project total have been updated to match
(408.5h) — see the constitution's 2026-08-22 changelog entry.

**Reconciled 2026-08-22 (later):** `M1b-core-tenancy.md` reached v2.0.0 after working
through a real onboarding case (SuperStyle Fashions) — organization provisioning split
from store creation, and the two-value `owner`/`staff` role enum replaced by a real
roles/permissions model spanning platform/organization/store scope, built and verified
via a dedicated TDD phase (`resolveEntitlements`/`hasPermission`). M1b is now 32.5h
(was 24h), M1's total is 115h (was 106.5h), and `constitution.md`'s M1 line and project
total have been updated to match (417h) — see that doc's 2026-08-22 changelog entry.

**Status as of 2026-08-22 (founder-reported):** Phase M1a Tasks 1 (Google Sign-in +
custom JWT) and 2 (PIN + device enrollment) are implemented and working — Google
sign-in, `members`/`devices` tables, and PIN login have all been through real
end-to-end debugging per `M1-auth-google.md`'s changelog (v1.5.0–v1.12.0, several real
bugs found and fixed via live browser testing: CORS, a StrictMode double-invoke race,
an `ON CONFLICT` constraint bug). Two things are worth closing out explicitly before
calling M1a fully done, rather than assuming they're covered because the auth flow
works: (1) `M1-auth-google.md`'s own Definition of Done checklist still has several
items unchecked — including the three offline-behavior checks (signed-in-offline
reload, signed-out-and-never-signed-in-offline, sign-out-then-offline-reload) and the
Google Console/Site-URL config checkboxes — that predate the later bug-fix rounds and
haven't been ticked off to match; (2) Task 3 (Sign In/Sign Up split + Remember Me,
4.5h) doesn't have an explicit "done" signal anywhere in `M1a-identity-auth.md` the way
`M1-auth-google.md` uses checkboxes, so its status should be confirmed directly rather
than assumed from "Google login + PIN setup is completed."

---

## Phase M1a — Identity & Auth (26.5h, ~weeks 1–3)

| Task | Delivers | Hours |
|---|---|---|
| Google Sign-in + custom JWT | `members` table, `mint-member-session` Edge Function, Google Cloud Console + Supabase provider config, client-side token swap, offline session caching in Dexie (per `M1-auth-google.md`) | 12 |
| PIN + device enrollment | `devices` table (composite `device_id`+`member_id`, so a shared device can carry more than one member's enrollment) with its own per-device PIN hash/lockout columns, `enroll-device` + `verify-pin` Edge Functions, client PIN entry UI, 30-day expiry handling | 10 |
| Sign In / Sign Up split, unified login page, Remember Me | Standard Sign In vs. Sign Up (Google-only) buttons, a unified `/login` page offering both PIN and Google, and a client-only "remember this device's email" convenience — added after the above two were already speced, see `M1a-identity-auth.md` v1.5.0 | 4.5 |

## Phase M1b — Core Tenancy, Roles & Entitlements (32.5h, ~weeks 3–6)

**Status (2026-08-22): approved for implementation, v2.0.0.** M1a Tasks 1–2 confirmed
live against real data (`members`/`devices` rows checked directly). Reworked from the
original 24h/five-task shape after a real onboarding case (SuperStyle Fashions)
surfaced that organization provisioning and store creation needed to be separate
actions, and that a two-value `owner`/`staff` role enum couldn't express Owner/
Manager/Accountant at the org level plus Sales/Cleaning/Temporary staff at the store
level. Full spec now in `M1b-core-tenancy.md` — still built next specifically because
the Offline Sync Engine (M2) cannot be meaningfully tested without a real member→store
link, which only this phase creates; see that doc's "Why this is next" section.
Executed in three sequential sub-phases, not five independent tasks:

| Sub-phase | Delivers | Hours |
|---|---|---|
| Schema | `organizations`, `roles`/`permissions`/`role_permissions` (seeded), `memberships` (now `role_id`-based, spanning platform/org/store), `stores.organization_id`, generalized `store_invitations`, `channels`, `access_grants`; updated ER diagram; platform-admin bootstrap seed run against the two real accounts | 13.5 |
| Entitlements (TDD) | `resolveEntitlements`/`hasPermission` — the single function every Edge Function and the client both call to authorize/render, built test-first against 7 cascade scenarios | 10 |
| UI | Admin org-provisioning screen, Owner/Manager store-creation flow, staff invite/accept/revoke for all three store-level roles | 9 |

## Phase M1c — Stock Distribution & Franchise Linkage (18h, ~weeks 5–7)

| Task | Delivers | Hours |
|---|---|---|
| Stock locations/transfers | `stock_locations`, `stock_transfers` schema + basic transfer-creation flow (dropdown scoped to the user's own accessible locations) | 6 |
| Franchise linkage | `franchise_groups`, `franchise_memberships` schema + a basic join/leave-a-franchise-group flow | 6 |
| Goods-received-from-franchisor | The stock-in flow that replaces Purchase-Trip for franchise stores | 6 |

## Phase M1d — Settlement Rule Engine (16h, ~weeks 7–9)

| Task | Delivers | Hours |
|---|---|---|
| Rule-engine primitives | `percentage_of_gross`, `percentage_of_remainder`, `fixed_fee`, `minimum_guarantee`, cliff/slab conditions — each independently unit-tested per §2.V | 8 |
| Bandrip config + statements | Bandrip's contract expressed as configuration, `settlement_statements` computation + persistence, basic display of a store's monthly statement | 8 |

## Phase M1e — RLS & Verification (22h, ~weeks 9–11)

| Task | Delivers | Hours |
|---|---|---|
| RLS policies, all M1 tables | Org/store-scoped access, `access_grants`-based franchisor visibility, Platform Owner bypass, and the `stock_transfers` org/franchise-link validation (from this conversation's last exchange) | 14 |
| Definition-of-Done pass | Offline-mode check for auth, 375px UI check on any new screens, general integration QA | 8 |

---

## Sequencing notes

Phases are ordered by dependency, not by importance — `memberships` needs `members` to
exist first, `franchise_memberships` needs `organizations`/`stores` first, and so on.
They're written as sequential blocks because it's one solo developer; there's no
parallelism to exploit here.

**One DoD item can't be fully closed within M1 itself:** constitution §7's "sync
round-trip verified" requirement depends on the offline sync engine, which is M2 — not
built yet. M1's tables can and should be tested standalone (schema correctness, RLS
correctness, auth flows), but full sync-round-trip verification for these specific
tables necessarily happens once M2 lands, not before. Flagging this now so it isn't
mistaken for a missed task later.

---

## What this means for the 320-hour roadmap

The constitution's total (320h, ~9–10 months) was built on M1 = 18h. At ~102h (now
115h — see the 2026-08-22 reconciliation notes above), M1 alone costs more than M2
(62h) and roughly a third of M4 (52h) combined would. Two honest paths were laid out,
not a recommendation either way:

1. **Accept the larger M1** — it's real scope, driven by a real customer (Bandrip), not
   speculation — and revise the constitution's total roadmap estimate (and likely
   timeline-to-launch) upward by roughly the 84-hour difference.
2. **Trim M1 further** — e.g., defer PIN/device-enrollment (fall back to Google sign-in
   only for now) or defer franchise linkage until closer to when Bandrip is actually
   ready to go live on the platform — to bring this phase closer to a smaller number,
   at the cost of building some of this twice later.

**Decided (2026-08-21, logged in `constitution.md` §8): path 1, accept the larger M1.**
The project total moved from 320h to 404h at that time, to 408.5h with M1a Task 3's
+4.5h folded in (2026-08-22), and now to 417h with M1b's v2.0.0 rework (2026-08-22,
later) — see `constitution.md`'s M1 line and total in §5.
