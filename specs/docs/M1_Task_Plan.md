# M1 Task Plan — Identity, Tenancy, Franchise, RLS

**Basis:** everything designed across this conversation, consolidated against
`constitution.md` v1.2.0, `M1-auth-google.md`, `M1-core-tenancy-schema.md`,
`M1-franchise-model.md`, `M1-schema-reference.md`.
**Pace assumption:** solo developer, ~10 hrs/week (constitution §1).
**Starting point:** 2026-08-21.

---

## Headline number

**~102 hours, ~10–11 weeks** at 10 hrs/week — against the constitution's original M1
line item of **18 hours**. That gap is real, not a rounding issue: the original 18h
assumed phone OTP and a bare schema; what's actually been designed since is Google
Sign-in + custom JWT, device-gated PIN login, a full multi-tenant organization/store
model, invite-based staff onboarding, a generic cross-tenant access primitive, central
stock distribution, franchise linkage, and a settlement rule engine — each with its own
real engineering and testing cost. See the note at the end on what this does to the
320-hour total roadmap.

**Not yet re-summed:** Phase M1a's own row below grew from 22h to 26.5h
(`M1a-identity-auth.md` v1.5.0 added a Sign In/Sign Up UX task after this plan was
first written) — a +4.5h delta not yet folded into the 102h headline above or
`constitution.md`'s M1 line. Small enough to defer a full re-tally until another
phase's scope also moves; flagging so it isn't mistaken for a reconciled total.

---

## Phase M1a — Identity & Auth (26.5h, ~weeks 1–3)

| Task                        | Delivers                                                                                                                                                                                  | Hours |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Google Sign-in + custom JWT | `members` table, `mint-member-session` Edge Function, Google Cloud Console + Supabase provider config, client-side token swap, offline session caching in Dexie (per `M1-auth-google.md`) | 12    |
| PIN + device enrollment     | `devices` table (composite `device_id`+`member_id`, so a shared device can carry more than one member's enrollment) with its own per-device PIN hash/lockout columns, `enroll-device` + `verify-pin` Edge Functions, client PIN entry UI, 30-day expiry handling                                        | 10    |
| Sign In / Sign Up split, unified login page, Remember Me | Standard Sign In vs. Sign Up (Google-only) buttons, a unified `/login` page offering both PIN and Google, and a client-only "remember this device's email" convenience — added after the above two were already speced, see `M1a-identity-auth.md` v1.5.0 | 4.5   |

## Phase M1b — Core Tenancy Schema (24h, ~weeks 3–5)

| Task                             | Delivers                                                                                                                                    | Hours |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Organizations/stores/memberships | Schema + migrations for `organizations`, `stores` (extended with `organization_id`), `memberships`; basic create/read paths                 | 8     |
| Store invitations + revocation   | `store_invitations` table, invite-email send, accept flow, revoke action that also kills PIN/device access (per the quit-and-rejoin design) | 8     |
| Access grants primitive          | `access_grants` schema + grant/revoke functions — used immediately for Platform Owner access                                                | 4     |
| Channels                         | `channels` table, default `pos` row per store                                                                                               | 2     |
| `store_business_model` view      | The derived-not-stored business-model logic + test fixtures for all three Phase 1 scenarios                                                 | 2     |

## Phase M1c — Stock Distribution & Franchise Linkage (18h, ~weeks 5–7)

| Task                           | Delivers                                                                                                                            | Hours |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Stock locations/transfers      | `stock_locations`, `stock_transfers` schema + basic transfer-creation flow (dropdown scoped to the user's own accessible locations) | 6     |
| Franchise linkage              | `franchise_groups`, `franchise_memberships` schema + a basic join/leave-a-franchise-group flow                                      | 6     |
| Goods-received-from-franchisor | The stock-in flow that replaces Purchase-Trip for franchise stores                                                                  | 6     |

## Phase M1d — Settlement Rule Engine (16h, ~weeks 7–9)

| Task                        | Delivers                                                                                                                                            | Hours |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Rule-engine primitives      | `percentage_of_gross`, `percentage_of_remainder`, `fixed_fee`, `minimum_guarantee`, cliff/slab conditions — each independently unit-tested per §2.V | 8     |
| Bandrip config + statements | Bandrip's contract expressed as configuration, `settlement_statements` computation + persistence, basic display of a store's monthly statement      | 8     |

## Phase M1e — RLS & Verification (22h, ~weeks 9–11)

| Task                        | Delivers                                                                                                                                                                                      | Hours |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| RLS policies, all M1 tables | Org/store-scoped access, `access_grants`-based franchisor visibility, Platform Owner bypass, and the `stock_transfers` org/franchise-link validation (from this conversation's last exchange) | 14    |
| Definition-of-Done pass     | Offline-mode check for auth, 375px UI check on any new screens, general integration QA                                                                                                        | 8     |

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

The constitution's total (320h, ~9–10 months) was built on M1 = 18h. At ~102h, M1 alone
now costs what M2 (62h) and roughly a third of M4 (52h) combined would. Two honest paths
forward, not a recommendation either way:

1. **Accept the larger M1** — it's real scope, driven by a real customer (Bandrip), not
   speculation — and revise the constitution's total roadmap estimate (and likely
   timeline-to-launch) upward by roughly the 84-hour difference.
2. **Trim M1 further** — e.g., defer PIN/device-enrollment (fall back to Google sign-in
   only for now) or defer franchise linkage until closer to when Bandrip is actually
   ready to go live on the platform — to bring this phase closer to a smaller number,
   at the cost of building some of this twice later.

Worth deciding deliberately rather than letting the total roadmap drift silently — this
is exactly the kind of change constitution §8 asks to be logged, not just absorbed.
