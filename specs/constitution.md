# TallyThreads — Project Constitution

**Version:** 1.5.0 · **Ratified:** 2026-08-18 · **Last amended:** 2026-08-22 · **Status:** Active

This document is the source of truth for how TallyThreads is built. Any human contributor
or AI coding agent (Claude Code, etc.) working on this repo MUST read this file first and
treat it as binding. Decisions here were made deliberately, after weighing alternatives —
do not silently override them mid-task. If a principle needs to change, amend this file
explicitly (see §8), don't drift from it in a pull request.

---

## 0. Product Identity

| | |
|---|---|
| **Name** | TallyThreads |
| **Spelling** | `Parda` (from Hindi/Urdu *पर्दा* / پردہ — "curtain, veil, reveal"). **NEVER** `Parada` — that spelling collides phonetically with the Prada trademark (confirmed: PRADA S.A. has litigated over marks as distant as "RADA"). Any AI agent encountering "Parada" in a prompt, ticket, or comment should treat it as a typo and correct to "Parda". |
| **Domain** | `tallythreads.in` |
| **Target market** | Independent, multi-store/chain, and franchise cloth/garment retailers in India (v1 build target — see §2.II, §2.IX, §3) |
| **Core differentiator** | The Purchase-Trip module — landed-cost tracking for owners who travel to source stock (Surat, Kerala, Bangladesh, etc.) before it ever reaches the shop |
| **Brand colors** | Green `#2FBF71` · Lavender `#7B7FE0` |
| **Tagline** | "వస్త్ర దుకాణాల ఆపరేటింగ్ సిస్టమ్" / "Cloth store operating system" |
| **Trademark status** | ⚠️ India Trademark Registry search (class 9 + 35 + 42) **not yet completed** as of ratification. Do not proceed to public launch until this is closed out with a lawyer. |

---

## 1. Who This Is Built By, And Under What Constraints

- Built solo by a full-time employed React.js developer, nights and weekends, alongside
  a demanding job and an active green card process. Realistic capacity: **~10 hours/week**.
- Total budget ceiling: **₹15–20 lakh over 3 years**. Recurring infra cost must stay near
  **$45/month** (Supabase Pro $25 + Vercel Pro $20) plus incidental domain/legal fees.
- **IP separation is non-negotiable.** All code is written on personal hardware, personal
  accounts, outside employer working hours. The business entity, when formed, is registered
  under a co-founder who is not bound by the developer's employment contract. No commits,
  no cloud resources, no dependencies should ever touch employer-owned infrastructure.
- **This is a real product launch, not a pilot or trial.** Bandrip (the founder's
  family's franchise store) is the first genuine customer TallyThreads is launching
  with — a committed ~6-month engagement to get it working, fix real issues as they
  surface, and ship real enhancements, before expanding to more customers. Nellore and
  Tirupati (two other family-run stores) are additional early stores alongside
  Bandrip — all three are real usage from day one, not disposable test data ahead of
  some later "real" launch.
- **Two distinct owner roles exist and must not be conflated:** the **Platform Owner**
  (the founder, operating TallyThreads itself as a SaaS product) and a **Store Owner**
  (a TallyThreads customer who owns/runs one or more stores). Platform-level access is
  never store-scoped, and store-level access is never automatically platform-wide.
  Detailed identity/role mechanics live in the `M1-auth-*` module specs, not here —
  this file only fixes the principle that the two are separate.

---

## 2. Core Principles

### I. Offline-First, From Day One

Billing at a physical counter must never fail because the internet dropped. This was
debated and reversed once already (see §8 changelog) — the final decision is: **build
the offline sync layer (Dexie.js + Supabase push/pull) as part of the initial release**,
not as a post-launch add-on. Every write path (invoice creation, stock movement) must go
through local storage first, sync second.

### II. Cloth-Store Focus — No Premature Horizontal Expansion

This product is being built for cloth/garment retailers. Jewelry, furniture, and other
"travel-to-source" verticals were discussed and explicitly deferred. Do not add
vertical-specific fields, flows, or copy for other industries until v1 has validated
product-market fit in cloth retail with real paying customers. If expansion ever happens,
it happens as a deliberate rebrand decision, not a scope-creep accident.

Note this is a **vertical** boundary (what kind of retail — cloth vs. jewelry/furniture),
distinct from the **store-model** boundary in §2.IX (independent vs. chain vs. franchise,
etc., all still cloth retail). Widening §2.IX's store-model scope is not a §2.II violation.

### III. Open-Source Only, No License Fees

Every library in the stack must be permissively licensed (MIT, Apache 2.0, ISC, BSD).
No paid SDKs, no per-seat proprietary tooling. The only recurring costs allowed are
infrastructure (Supabase, Vercel, domain) and, later, the Claude API — never software
licenses. See §4 for the locked dependency list; check license before adding anything new.

### IV. The Purchase-Trip Module Is Not Optional

Barcode, GST billing, size/color inventory — every competitor already has these
(Ginesys, GoFrugal, QueueBuster, Zwing, Vyapar). They are table stakes, not the reason
anyone switches. The Purchase-Trip → Landed-Cost → MRP flow is the one thing no
competitor offers. If time runs short, cut AI Studio, cut advanced reports — **never**
cut or under-invest in this module.

This module assumes a store owner who personally selects and buys their own stock — true
for the Independent and Multi-store/chain models in scope for v1. It is **not** assumed to
apply to Franchise, EBO, MBO, or Wholesale models (§2.IX) — those typically receive
inventory decisions from a franchisor/brand rather than sourcing it themselves. A
franchise store (now also in v1 scope, §2.IX) gets a **goods-received-from-franchisor**
flow instead of Purchase-Trip — a different module, not a variant of this one. Whoever
designs a later phase for Wholesale should likewise treat Purchase-Trip as
optional-per-store-type, not force-fit it.

### V. Test the Money Logic

Three pieces of business logic touch money directly and must have unit test coverage
before anything ships to a real store:

1. **GST slab calculation** (`lib/gstCalc.ts`) — ₹2,500 per-piece threshold, including the
   discount-drops-price-below-threshold edge case.
2. **Landed cost calculation** (`lib/landedCost.ts`) — trip expenses distributed across lots.
3. **Franchise settlement calculation** (`lib/franchiseSettlement.ts`) — added 2026-08-21
   once a real franchise case existed (Bandrip, see §8). Computes the stock-replacement
   share and royalty a franchise store owes its franchisor: e.g. Bandrip's 50% stock
   share, plus 13% royalty calculated on the *remainder after that share* (not gross —
   corrected 2026-08-21) once monthly revenue crosses ₹3,00,000. This is still a
   **cliff**, not a slab — crossing the threshold taxes the whole month's post-share
   remainder, not just the excess — which must be tested explicitly, the same way
   `gstCalc.ts` tests the discount-drops-below-threshold edge case. Confirm the exact
   boundary (`>` vs. `>=` ₹3,00,000) and the revenue basis (gross vs. taxable value)
   against the real signed agreement before writing the tests, not after. Full worked
   example: `store-model-master-plan.md` §5.

A bug here either overcharges a customer (trust destroyed instantly), misprices stock
(silent margin erosion the owner won't notice for months), or mis-settles a franchise
relationship (a partner shortchanged or overcharged every month, discovered only when
someone finally reconciles by hand). No exceptions.

### VI. Ship The Thinnest Slice That Proves The Model

Scope for v1 (P1) is deliberately narrow: Purchase Trips, Inventory + Barcode, Billing +
GST, basic Reports, Settings, plus (as of 2026-08-21) Franchise settlement and
goods-received-from-franchisor, since a real franchise case exists (§2.IX, §8). AI Studio
(Claude-powered descriptions, video scripts, review summarization), loyalty programs, and
the two remaining deferred store models in §2.IX (Wholesale, Omnichannel) are P2+ — built
only after Bandrip and the other early stores generate real usage data and a real
feature request list.

### VII. No Store Prefix, No Generic Names — But Don't Re-litigate Naming

The name is TallyThreads. The logo reuses the awning icon and green/lavender palette
established for the earlier "StoreNode" concept. This decision is closed — do not
reopen it casually; naming churn has already cost real time in this project's history
(see §8).

### VIII. Budget and Time Are Both Hard Constraints

Every module estimate in §5 assumes a 10 hr/week solo pace. Before adding any feature
not listed in the P1 backlog, ask: does this delay launching with Bandrip? If yes,
it does not belong in v1.

### IX. Store Model Extensibility — Build Two, Architect for Eight

TallyThreads recognizes eight store models found in Indian cloth/garment retail:

1. Independent/standalone store
2. Multi-store / chain
3. Franchise
4. Exclusive Brand Outlet (EBO)
5. Multi-Brand Outlet (MBO)
6. Wholesale / distributor
7. Boutique / designer label
8. Omnichannel / online-plus-physical

**Phase 1 (v1) builds and ships UI/workflow for six of the eight: #1 Independent,
#2 Multi-store/chain, and #3 Franchise** (added 2026-08-21 — Bandrip, the founder's
family's own franchise store, is a real near-term case, not a hypothetical; see §8).
**#4 EBO, #5 MBO, and #7 Boutique ride along as low-cost variants** rather than needing
separate tenancy work: EBO is #2's ownership shape (company-owned) or #3's (franchisee-
owned) plus a brand label; MBO and Boutique are product-catalog flexibility (M3), not a
tenancy concern. **Only #6 Wholesale/distributor and #8 Omnichannel remain explicitly
deferred** (no UI, no workflow, no feature work in v1) — see §3.

**The data model and core architecture must not assume there will only ever be these
six.** Concretely: a `stores` table's ownership relationship must not hard-code "exactly
one owner, exactly one store" (multi-store/chain and franchise both break that in v1);
and the identity/hierarchy structure being built for #1–#3 (owner ↔ store links, invites,
roles, and a generalized `access_grants` primitive rather than a franchise-specific one —
see `store-model-master-plan.md`) should be shaped so that a wholesale/distributor link
or an omnichannel sales channel can attach to it later as additional structure, not as a
schema rewrite. §6 has the specific architecture rule this implies; §2.IV explains why
Purchase-Trip is not assumed mandatory for Franchise or Wholesale.

---

## 3. Non-Goals for v1 (Explicitly Out of Scope)

- ❌ React Native mobile app (deferred until PWA validates the model; revisit once
  revenue justifies the native-app investment — see §8 for the reasoning trail). The
  auth/identity design should stay usable from a future native client without rework
  (see `M1-auth-google.md`), even though no mobile client is built in v1.
- ❌ AI Studio (Claude-powered video scripts, review collection, trend analysis)
- ❌ Multi-vertical support (jewelry, furniture, footwear) — see §2.II
- ❌ Wholesale/distributor and Omnichannel store models (§2.IX, items #6 and #8) — no UI
  or workflow built for these in v1; the data model must not preclude them later (§2.IX, §6)
- ❌ Loyalty programs, staff commission tracking
- ❌ Payment gateway integration beyond recording payment mode (cash/UPI/card) —
  no card data storage, no PCI scope, ever

**Multi-store/chain and Franchise (§2.IX items #2 and #3) are now in v1 scope** — see the
2026-08-21 changelog entries in §8. Both were previously listed here as non-goals; those
lines have been superseded. Franchise moved in specifically because a real case exists
(Bandrip), not as a speculative expansion — see §2.IX.

---

## 4. Tech Stack (Locked)

| Layer | Choice | License |
|---|---|---|
| Build tool | Vite + React 18 + TypeScript | MIT |
| PWA | `vite-plugin-pwa` (Workbox) | MIT |
| Styling | Tailwind CSS | MIT |
| Offline DB | Dexie.js (IndexedDB) | Apache 2.0 |
| Data/sync | TanStack Query | MIT |
| Routing | React Router v6 | MIT |
| Forms/validation | React Hook Form + Zod | MIT |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) | Apache 2.0 |
| Barcode generation | JsBarcode (Code128) | MIT |
| Receipt print (fallback) | `react-to-print` (browser print dialog) | MIT |
| Receipt print (direct) | `esc-pos-encoder` + Web Bluetooth API | MIT |
| Icons | Lucide React | ISC |
| Testing | Vitest + React Testing Library | MIT |
| Package manager | pnpm | MIT |
| Hosting | Vercel Pro ($20/mo — required once commercial per Vercel ToS) | — |
| Backend infra | Supabase Pro ($25/mo) | — |

**Known platform constraints (verified 2026):**

- Web Bluetooth API: works on Android Chrome, Desktop Chrome/Edge. **Does not work on
  iOS Safari** (Apple has stated no plans to implement). Target market is
  overwhelmingly Android — accepted risk.
- BarcodeDetector API (camera scanning): full support on Android Chrome only, partial
  on desktop Chrome, none on Safari. **Primary barcode input method is a hardware HID
  scanner** (₹2,000–4,000), which bypasses all browser API limitations entirely —
  camera scanning is a fallback only.

---

## 5. Module Roadmap (Reference: full backlog in `tallythreads-techstack-tasks.html`)

| Module | Scope | Est. hours |
|---|---|---|
| M0 | Project foundation, PWA config, CI | 8 |
| M1 | Identity, tenancy, franchise linkage & settlement engine, RLS — five sub-phases (M1a–M1e) fully speced in `M1-task-plan.md`. Covers: Google Sign-in + device-gated PIN (`M1-auth-google.md`, `M1a-identity-auth.md` — M1a Tasks 1–2 implemented, see §8); organizations/stores/roles/permissions/memberships/store_invitations/access_grants/channels, now with a platform/organization/store role model and a TDD-built entitlements function (`M1b-core-tenancy.md` v2.0.0); `stock_locations`/`stock_transfers` and `franchise_groups`/`franchise_memberships` plus the settlement rule engine (`M1-franchise-model.md`); full column reference in `M1-schema-reference.md`; RLS across all of it, including the `stock_transfers` org/franchise-link validation (§8) | 115 |
| M2 | **Offline sync engine** (Dexie ⇄ Supabase push/pull) | 62 |
| M3 | Inventory, variant matrix, barcode | 36 |
| M4 | **Purchase-Trip module** (landed cost engine) | 52 |
| M5 | Billing/POS, GST calc, printing | 58 |
| M6 | GST reports, GSTR export | 24 |
| M7 | Settings, onboarding | 16 |
| M8 | PWA polish, offline UX, shadow-mode verification before go-live with Bandrip | 30 |
| M9 | Launch prep | 16 |
| **Total** | | **417 hrs (~42 weeks @ 10 hr/wk, ~11–12 months w/ buffer)** |

**Sequencing rule:** M2 must be stable and tested before M3, M4, or M5 begin in earnest.
Building inventory/billing/trip features on top of an unstable sync layer means rework
later — the foundation is not allowed to be "good enough for now." M1's own five
sub-phases (M1a–M1e) are themselves sequential and precede M2 — M2 is the next module
after M1 closes out, not a parallel track.

**M1's hour estimate is 115h** (was 18h originally, then 102h, then 106.5h; +8.5h
reconciled 2026-08-22 when M1b reached v2.0.0 — see §8). The increase is real, driven
by real scope — Google Sign-in + PIN, the full organizations/roles/permissions/
memberships/access_grants tenancy skeleton (now a real platform/organization/store
role model with its own TDD-built entitlements function, not a two-value enum),
central stock distribution, franchise linkage, the settlement rule engine, and RLS
across all of it — not speculative padding, and not something to silently absorb: the
project total below has been revised from 320h to 404h to 408.5h to 417h accordingly
(see §8's 2026-08-21 and 2026-08-22 entries). This was a deliberate choice to accept
the larger M1 rather than trim it, since the franchise requirement is driven by a real
customer (Bandrip), not a hypothetical.

---

## 6. Architecture Rules

- **Invoice numbering:** `{store_code}-{device_id}-{local_sequence}` — generated
  client-side, never a central counter. Central counters break under offline
  concurrent writes from multiple devices.
- **Every Supabase table** carries `last_modified_at` and `deleted_at` (soft delete).
  No hard deletes in sync-participating tables — ever.
- **Conflict resolution:** last-write-wins by `last_modified_at`. No manual merge UI in v1.
- **Dexie tables mirror Supabase tables** with two additions: `_dirty` (pending push) and
  `_localId` (optimistic UI before server ID is assigned).
- **Region:** Supabase project pinned to `ap-south-1` (Mumbai) for latency to Indian stores.
- **Store ownership model (§2.IX):** the relationship between an owner identity and a
  `store` must support one owner linked to more than one store (multi-store/chain, in
  scope for v1) — never hard-code a 1:1 owner:store assumption. A franchisor/franchisee
  relationship (also in scope for v1, §2.IX) is a *different* owner linked to a store via
  a scoped read grant, not co-ownership — see `access_grants` below. Structures needed
  only by the two still-deferred models (a wholesale/distributor link, an omnichannel
  sales channel) should be addable later as new tables/relationships referencing the same
  core `stores`/owner identities, not as a rework of them.
- **Cross-tenant access (`access_grants`):** any case where one party needs read
  visibility into another party's store data (Platform Owner support access, a
  franchisor's visibility into a franchisee, later an accountant/auditor) is implemented
  as one generalized grant — `{grantee, scope, permission, granted_by, expires_at}` — not
  a bespoke mechanism per relationship. See `store-model-master-plan.md`.
- **Central stock distribution (`stock_locations`/`stock_transfers`):** a godown/warehouse
  distributing stock to one or more stores is modeled the same way whether the recipient
  stores belong to the same owner (multi-store/chain, no settlement implied) or a
  different one (franchise, where the same transfer also implies a monthly settlement —
  see §2.V's franchise settlement calculation). The transfer mechanism doesn't change;
  only whether a payment obligation is attached to it does.
- **Identity vs. store access are separate concerns:** a person's login identity
  (`members`, or equivalent) is never itself scoped to a store or a platform role. What
  stores a person can act in, and with what role, is a separate join, created via
  invite/acceptance, not by the act of signing in. Platform-level access (§1) is a
  separate flag again, independent of any store join. (Full mechanics: `M1-auth-*` specs.)

---

## 7. Definition of Done (per module)

A module is not "done" until:

1. Unit tests pass for any money-touching logic (§2.V)
2. It works correctly with the network disabled (offline-first is not optional per-module)
3. It has been manually tested at 375px viewport width (billing counters use small
   Android tablets/phones)
4. Sync round-trip verified: create offline → reconnect → confirm data on Supabase side

---

## 8. Governance & Amendment Log

This constitution may be amended, but not casually. An amendment requires:

1. A clear reason tied to real evidence (real usage data, a blocked technical path, a
   changed constraint like budget or timeline) — not a mid-session change of mind.
2. An entry in this changelog explaining what changed and why.

### Changelog

- **2026-08-22 (latest) — M1b reworked to v2.0.0; roles/permissions model, hours
  reconciled; v1.5.0.** Working through a real onboarding case (SuperStyle Fashions:
  one org, an Owner/Manager/Accountant, a store created after the org exists, and
  sales/cleaning/temporary staff underneath it) surfaced that the original
  admin-provisions-org-and-store-together design and its two-value `owner`/`staff`
  role enum were both too coarse. `M1b-core-tenancy.md` now: separates organization
  provisioning (still admin-only) from store creation (now the org's own Owner/
  Manager); replaces the `members.platform_role` column with a `memberships` row like
  every other grant, spanning three scopes (platform/organization/store) through one
  `roles`/`permissions`/`role_permissions` model instead of a hardcoded enum; and adds
  a dedicated TDD phase building `resolveEntitlements`/`hasPermission` as the single
  function every Edge Function and the client both call — no scattered role checks.
  Execution is now three sequential phases (Schema → Entitlements/TDD → UI) rather
  than five independent tasks. Both known platform-admin accounts (founder +
  `storenode.hq@gmail.com`) are seeded by real `members.id` as part of Phase 1's
  bootstrap step — a one-time, out-of-band SQL insert, never an app-reachable path,
  which is what keeps platform-admin status impossible to self-grant. M1b's hour
  estimate moves from 24h to 32.5h (+8.5h) — real new work (the roles/permissions
  schema, the entitlements function and its test suite, the org-vs-store provisioning
  split), not padding — so M1's total moves from 106.5h to 115h and the project total
  from 408.5h to 417h (§5).
- **2026-08-22 (later still) — Reframed as a real launch, not a pilot; v1.4.0.**
  Founder correction: TallyThreads is not a low-stakes trial waiting for a "real"
  customer later — Bandrip is a genuine customer being launched now, with a committed
  ~6-month engagement to fix real issues and ship real enhancements before reaching
  more customers. Every "pilot" reference in this file that implied otherwise has been
  reworded (§1, §2.VI, §2.VIII, §5, §8) — Nellore/Tirupati are still accurately
  described as smaller, family-run stores, but the "free, low-stakes, testing ground
  before any external sale" framing is gone; all three stores are real usage from day
  one. This doesn't change any scope, architecture, or hour estimate — it's a
  correction to how the project's current stage is described, not a new decision about
  what to build. `M1b-core-tenancy.md` still has a couple of "pilot" references from
  before this correction — left as-is for now at the founder's request while the
  admin-provisioning design in that doc is still being discussed; update those once
  that discussion concludes, not as a separate action item.
- **2026-08-22 (later) — M1a confirmed live; M1b next, ahead of M2.** Founder shared
  real `members`/`devices` rows directly from Supabase — correct `google_id`,
  `email_verified`, bcrypt `pin_hash`, `pin_expires_at` exactly 30 days out,
  `last_login_location` populated with a real IP. M1a Tasks 1–2 are confirmed working
  end-to-end, not just spec-complete. Founder confirmed Task 3 (Sign In/Sign Up split,
  Remember Me) is also done, closing out M1a. Considered jumping straight to M2
  (Offline Sync Engine) next, but found a real blocker first: M2's own DoD requirement
  (§7, "create offline → reconnect → confirm on Supabase") needs a real store-scoped
  table and a member→store link to write it through — and `memberships` doesn't exist
  yet, so every member today (including the real one above) has no store at all
  (M1a's "no store assigned" page is firing correctly, for exactly this reason).
  Decided: build **M1b — Core Tenancy Schema** next (`organizations`/`stores`/
  `memberships`/`store_invitations`/`access_grants`/`channels`/`store_business_model`,
  full spec now in `M1b-core-tenancy.md`), then M2, rather than reordering past a real
  dependency. This keeps the original M1a→M1b→…→M1e→M2 sequence intact — the
  reordering that was floated didn't hold up once the dependency was checked.
- **2026-08-22 — M1a Tasks 1–2 implemented; Task 3 hours reconciled; v1.3.1.**
  Google Sign-in + custom JWT (Task 1) and PIN + device enrollment (Task 2) are
  implemented and working, per the founder's real-world testing and the detailed
  live-debugging trail in `M1-auth-google.md` (v1.5.0→v1.12.0: a CORS misconfiguration,
  a Postgres `ON CONFLICT` constraint bug, and a React 18 StrictMode double-invoke race
  were each found via real browser testing and fixed). `M1a-identity-auth.md` reached
  v1.5.0 in the process, adding Task 3 (Sign In/Sign Up split, unified `/login` page,
  Remember Me — 4.5h) after Tasks 1–2 were already speced. That +4.5h had been flagged
  in `M1-task-plan.md` as "not yet re-summed" for a time; it's now folded in — M1a is
  26.5h (was 22h), M1's total is 106.5h (was 102h), and the project total is 408.5h
  (was 404h) — see §5. Two things are flagged as still open, not silently assumed
  closed just because the auth flow itself works: (1) several items on
  `M1-auth-google.md`'s own Definition of Done checklist — notably all three
  offline-behavior checks (signed-in-offline reload, never-signed-in-offline,
  sign-out-then-offline-reload) and the Google Console/Site-URL config items — remain
  unchecked, predating the later bug-fix rounds; worth an explicit verification pass
  rather than assuming they're covered. (2) Task 3's completion status isn't tracked
  with the same checkbox convention `M1-auth-google.md` uses, so it should be
  confirmed directly before treating M1a as fully closed. Also clarified a scope
  distinction worth keeping straight going forward: M1a's Dexie work (caching the
  signed-in member's *session* for offline auth) is a small, already-built piece of
  M1a — it is **not** the M2 "Offline sync engine" (Dexie ⇄ Supabase push/pull for
  business data — products, invoices, stock transfers — 62h, a separate, much larger,
  not-yet-started module). The two should not be conflated when deciding what's done
  and what's next.
- **2026-08-21 — M1 fully speced, project total revised to 404h; v1.3.0.** M1's design
  is now complete across four docs — `M1-core-tenancy-schema.md` (organizations, stores,
  memberships, invitations, access grants, channels, stock locations/transfers),
  `M1-franchise-model.md` (franchise groups/memberships, the settlement rule engine,
  goods-received-from-franchisor), `M1-schema-reference.md` (all 14 tables' full columns,
  consolidated), and `M1-task-plan.md` (five sub-phases, M1a–M1e, ~102h). §5's M1 line
  item is revised from 18h to 102h and the project total from 320h to 404h
  (~11–12 months w/ buffer, up from ~9–10) — a deliberate acceptance of the larger,
  real scope rather than a silent absorption or a trim. Key decisions locked in along
  the way, for anyone reading the module docs rather than this changelog: a store's
  business model (independent/chain/franchise) is derived from its relationships, never
  stored as an editable field (`M1-core-tenancy-schema.md` §4) — so no conversion
  workflow is needed to keep the three Phase 1 models consistent; PIN login is gated by
  per-device enrollment, not usable from an unenrolled device even with a stolen PIN;
  franchise settlements are computed by a small reusable rule engine configured per
  contract, not a bespoke function per customer; and `stock_transfers`, while not
  currently constrained by a database check, is tracked as an explicit RLS-design
  requirement (`M1-task-plan.md`, Phase M1e) to prevent a transfer between an
  organization and a store it has no legitimate relationship to.
- **2026-08-21 — Franchise moved into v1 scope; v1.2.0.** A real franchise case exists
  (Bandrip, the founder's family's own franchise store), so Franchise (§2.IX item #3)
  moves from deferred to Phase 1 alongside Independent and Multi-store/chain. This
  required two new pieces: (1) a generalized `access_grants` primitive (§6) instead of a
  franchise-specific access feature, so Platform Owner access and franchisor read-access
  share one mechanism; (2) a new money-logic requirement, the franchise settlement
  calculation (§2.V item 3) — modeled on Bandrip's actual terms (50% stock-replacement
  share, plus 13% royalty on the post-share remainder once monthly revenue crosses
  ₹3,00,000, a cliff not a slab). The exact boundary and revenue basis are still open
  pending confirmation against the real signed agreement — see
  `store-model-master-plan.md` §5. EBO and MBO/Boutique remain low-cost riders on this
  and the chain work respectively; only Wholesale/distributor and Omnichannel remain
  deferred (§3). M1's hour estimate has not been re-derived for any of this (§5).
- **2026-08-21 — Store-model scope widened; v1.1.0.** Per founder direction: TallyThreads's
  addressable market includes eight recognized store models (Independent, Multi-store/chain,
  Franchise, EBO, MBO, Wholesale/distributor, Boutique/designer-label, Omnichannel — new
  §2.IX). v1 continues to build and ship only Independent + Multi-store/chain (§2.IX, §3) —
  the P1 feature backlog (§2.VI) is unchanged. What changed is an architectural constraint:
  the store-ownership data model (§6) must not preclude the other six models being added
  later without a schema rewrite. §3's old "multi-store chain / franchise beyond basic data
  isolation" non-goal line is superseded — multi-store/chain moved into v1 scope; franchise
  and the other four deferred models remain explicit non-goals, now itemized individually.
  Also formalized the Platform Owner / Store Owner distinction (§1, §6) that this
  extensibility work depends on.
- **2026-08-21 — Auth method: Google Sign-in + PIN replaces phone OTP; folded into v1.1.0.**
  §5's original M1 line specified phone OTP. Per founder direction (see `M1-auth-google.md`,
  drafted 2026-08-19), M1's actual auth path is Google Sign-in as the primary credential
  check, with app identity held in TallyThreads's own `members` table and a custom JWT
  (never `auth.users`) — plus a device-enrollment-gated PIN for fast repeat login,
  designed from the start to work identically from a future native client. Phone OTP is
  not being pursued. This entry closes out the deviation flagged (but not yet logged) when
  that decision was made; a follow-up entry should record the PIN/device-enrollment/
  store-invite design once it's written up as a spec, rather than letting that drift too.
- **2026-08-18 — v1.0.0 ratified.** Consolidated decisions from planning discussion:
  name (TallyThreads, correcting the Parada/Prada collision risk), tech stack, offline-first
  reversal (initially deferred to post-pilot, then reversed to offline-from-start per
  founder's explicit instruction), PWA-only launch (React Native deferred — founder's
  primary skill is React.js, not React Native; native app revisited only after PWA
  validates demand).

---

## 9. For AI Coding Agents

If you are Claude Code (or any other AI agent) working in this repository:

- Do not introduce a proprietary or non-open-source dependency without flagging it
  explicitly to the human first (§2.III).
- Do not build features from §3 (Non-Goals) even if asked casually in passing — confirm
  explicitly that scope has changed and this file has been amended first. As of
  2026-08-21 only Wholesale/distributor and Omnichannel (§2.IX items #6 and #8) remain
  deferred this way — architecting for them is required (§2.IX, §6); building
  UI/workflow for them is not in scope until a future amendment says so.
- Do not weaken GST calculation, landed-cost, or franchise settlement logic test
  coverage to "make tests pass faster" (§2.V) — if a test is inconvenient, the code is
  wrong, not the test.
- When in doubt about a naming, branding, or scope question already decided here,
  cite this file rather than re-deriving an answer from scratch.
