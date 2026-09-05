# TallyThreads — Project Constitution

**Version:** 1.10.0 · **Ratified:** 2026-08-18 · **Last amended:** 2026-09-05 · **Status:** Active

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
| **Domain** | (domain not yet decided under the TallyThreads name) |
| **Target market** | Independent, multi-store/chain, and franchise cloth/garment retailers in India (v1 build target — see §2.II, §2.IX, §3) |
| **Core differentiator** | The Purchase-Trip module — landed-cost tracking for owners who travel to source stock (Surat, Kerala, Bangladesh, etc.) before it ever reaches the shop |
| **Brand colors** | Green `#2FBF71` · Lavender `#7B7FE0` |
| **Tagline** | "వస్త్ర దుకాణాల ఆపరేటింగ్ సిస్టమ్" / "Cloth store operating system" |
| **Trademark status** | ⚠️ India Trademark Registry search (class 9 + 35 + 42) **not yet completed** as of ratification. Do not proceed to public launch until this is closed out with a lawyer. |

> **Naming history note (added 2026-08-26):** during a planning session this project's docs
> briefly used "StoreParda" as a working name, including a Parda-vs-Prada trademark-collision
> discussion that applied only to that working name. The actual codebase, package name, and
> repo-level specs never changed from TallyThreads — the rename was never carried past the
> planning docs. This constitution (and the rest of the `claude/*` doc set) has been reverted
> to TallyThreads to match reality; see §8's 2026-08-26 entry. The Prada-collision
> concern does not apply to the name TallyThreads and is not carried forward.

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
   share, then the store's own running expenses (rent, power, utilities, salesperson
   salary), and **then** a 13% royalty on the *post-expense owner balance* — gated on
   monthly gross revenue crossing ₹3,00,000. The royalty base was corrected 2026-09-05
   (v1.10.0): it is the balance after both the stock share *and* the store's expenses,
   not the post-share remainder an earlier draft used — confirmed against the real
   Nellore Bandrip agreement, where ₹4,00,000 gross yields a ₹15,860 royalty and
   ₹1,06,140 owner take-home (not the ₹26,000 the old post-share base implied). The
   threshold is still a **cliff**, not a slab — crossing ₹3,00,000 (strictly `>`, so
   exactly ₹3,00,000 pays no royalty) taxes the whole post-expense balance, not just the
   excess — and the boundary must be tested explicitly, the same way `gstCalc.ts` tests
   the discount-drops-below-threshold edge case. Note the metric that *gates* the royalty
   (gross revenue) is distinct from the base it is *charged on* (post-expense balance).
   These terms are Bandrip's specific agreement and differ per customer: the engine is a
   **hybrid** — a data-driven config recipe of reusable primitives by default, with a
   coded-plugin fallback (a whitelist registry, never `eval` on stored data) for
   contracts the primitives can't express. Still to confirm before tests: whether the
   gross basis is gross-with-GST or taxable value. Full design + worked table + golden
   test: `reference/franchise-settlement.md` §4. **Not yet implemented as code** — as of
   v1.8.0 only the franchise *linkage* (M1c: `franchise_groups`/`franchise_memberships`)
   is being built; this settlement calculation itself is M1d, still unscheduled (§5,
   §8's 2026-08-27 entry).

A bug here either overcharges a customer (trust destroyed instantly), misprices stock
(silent margin erosion the owner won't notice for months), or mis-settles a franchise
relationship (a partner shortchanged or overcharged every month, discovered only when
someone finally reconciles by hand). No exceptions.

### VI. Ship The Thinnest Slice That Proves The Model

Scope for v1 (P1) is deliberately narrow: Purchase Trips, Inventory + Barcode, Billing +
GST, basic Reports, Settings, plus (as of 2026-08-21) Franchise settlement and
goods-received-from-franchisor, since a real franchise case exists (§2.IX, §8). Loyalty
programs and the two remaining deferred store models in §2.IX (Wholesale, Omnichannel)
are P2+ — built only after Bandrip and the other early stores generate real usage data
and a real feature request list. AI Studio (Claude-powered descriptions, video scripts,
review summarization) moved from an explicit non-goal to "role model designed, module
unscheduled" as of v1.6.0 (§3, §8) — its role/permission scaffolding exists now, but the
module itself — actual Claude API integration, a content data model, any UI — is still
gated on the same real-usage-data bar as everything else in this paragraph, and has no
hour estimate or slot in §5.

### VII. No Store Prefix, No Generic Names — But Don't Re-litigate Naming

The name is TallyThreads. The logo reuses the awning icon and green/lavender palette
established for the earlier "StoreNode" concept. This decision is closed — do not
reopen it casually; naming churn has already cost real time in this project's history
(see §8, including a 2026-08-26 correction where planning docs had drifted to a
different working name — "StoreParda" — without the codebase ever actually changing).

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
see `reference/schema.md`) should be shaped so that a wholesale/distributor link
or an omnichannel sales channel can attach to it later as additional structure, not as a
schema rewrite. §6 has the specific architecture rule this implies; §2.IV explains why
Purchase-Trip is not assumed mandatory for Franchise or Wholesale.

**As of v1.8.0, Franchise (item #3) has real schema, not just an architectural
promise** — see §8's 2026-08-27 entry. The distinction that makes a store "franchise"
rather than "chain" is a `franchise_memberships` row linking it to a `franchise_groups`
row, exactly as `reference/schema.md` §5's derived `store_business_model` view
always specified — this amendment is that view (and the two tables it reads) actually
being migrated onto the live database, not a change to the design itself.

---

## 3. Non-Goals for v1 (Explicitly Out of Scope)

- ❌ React Native mobile app (deferred until PWA validates the model; revisit once
  revenue justifies the native-app investment — see §8 for the reasoning trail). The
  auth/identity design should stay usable from a future native client without rework
  (see `reference/schema.md` §1), even though no mobile client is built in v1.
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

**AI Studio's role/permission model moved into scope as of v1.6.0 (2026-08-26)** — see
that changelog entry in §8, `M-ai-studio.md`, and `M-role-permission-model.md`. The
"❌ AI Studio" line previously here has been superseded, but narrowly: only the role
scaffolding (`platform_editor`/`platform_content_lead` roles, `content.create`/
`.review`/`.publish` permission keys) has been seeded. The module itself — real Claude
API integration, a content data model, any UI — is not scheduled into §5's roadmap and
has no hour estimate, gated on the same real-usage-data bar §2.VI describes for the
remaining P2+ items. Worth flagging plainly: unlike Franchise, this amendment isn't
driven by a concrete customer case — §8's amendment rule asks for "a clear reason tied
to real evidence... not a mid-session change of mind," and this one rests on explicit
founder direction alone, not a real AI Studio customer request yet.

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
| M1 | Identity, tenancy, franchise linkage & settlement engine, RLS — five sub-phases (M1a–M1e) fully speced in `M1-task-plan.md`. Covers: Google Sign-in + device-gated PIN (`M1-auth-google.md`, `M1a-identity-auth.md` — M1a Tasks 1–2 implemented, see §8); organizations/stores/roles/permissions/memberships/store_invitations/access_grants/channels, now with a platform/organization/store role model and a TDD-built entitlements function (`M1b-core-tenancy.md` v2.0.0); `stock_locations`/`stock_transfers` and `franchise_groups`/`franchise_memberships` plus the settlement rule engine (`M1-franchise-model.md`) — **franchise linkage now under active build, see §8's 2026-08-27 entry**; full column reference in `M1-schema-reference.md`; RLS across all of it, including the `stock_transfers` org/franchise-link validation (§8) | 115 |
| M2 | **Offline sync engine** (Dexie ⇄ Supabase push/pull) | 62 |
| M3 | Inventory, variant matrix, barcode | 36 |
| M4 | **Purchase-Trip module** (landed cost engine) | 52 |
| M5 | Billing/POS, GST calc, printing | 58 |
| M6 | GST reports, GSTR export | 24 |
| M7 | Settings, onboarding | 16 |
| M8 | PWA polish, offline UX, shadow-mode verification before go-live with Bandrip | 30 |
| M9 | Launch prep | 16 |
| **Total** | | **417 hrs (~42 weeks @ 10 hr/wk, ~11–12 months w/ buffer)** |

**AI Studio has no module number or hour estimate yet** (see §2.VI, §3's 2026-08-26
amendment, `roadmap/future/ai-studio.md`) — its role model is seeded ahead of time, same treatment
`M3`/`M4`/`M5`'s permission keys got in `M1b`, but it isn't in this table because it
isn't scheduled. It gets a number and a line here once `roadmap/future/ai-studio.md` §5's open
questions are answered and it's actually estimated — not before.

**M1c (Franchise linkage) status as of v1.8.0:** `franchise_groups`/`franchise_memberships`
and the `store_business_model` view are being migrated for real, driven by building an
actual demo organization ("Bandrip Demo") that needs a genuine franchisor/franchisee
relationship rather than a same-mechanism-as-chain placeholder. This is linkage only —
M1c's other two subtasks (stock locations/transfers, goods-received-from-franchisor) and
M1d (the settlement rule engine itself, `lib/franchiseSettlement.ts`) remain unbuilt and
unscheduled beyond `M1-task-plan.md`'s existing hour estimates. See §8's 2026-08-27 entry.

**Sequencing rule:** M2 must be stable and tested before M3, M4, or M5 begin in earnest.
Building inventory/billing/trip features on top of an unstable sync layer means rework
later — the foundation is not allowed to be "good enough for now." M1's own five
sub-phases (M1a–M1e) are themselves sequential and precede M2 — M2 is the next module
after M1 closes out, not a parallel track. **M1c's franchise-linkage work (above) is a
targeted exception, not a reordering of this rule** — it's a small, self-contained
schema addition needed to make real demo/test data honest, not the start of building
M1c's UI or M1d's settlement engine ahead of M2.

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
  a bespoke mechanism per relationship. See `reference/schema.md` §2.
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

- **2026-09-05 (latest) — Franchise settlement royalty base corrected; settlement engine
  made an explicit hybrid; v1.10.0.** Planning the Operations roadmap (Billing/Inventory/
  Trips/Reports/Settings) with the founder surfaced two things about the franchise
  settlement money-logic (§2.V item 3) that needed fixing before any of it is coded, both
  confirmed against the **real Nellore Bandrip agreement** (the founder's family owns that
  store, so this is first-hand contract knowledge, not a hypothetical — the strongest
  evidence bar §8 asks for). (1) **Royalty base corrected:** the 13% royalty is charged on
  the store owner's *post-expense* balance (after the 50% stock share *and* the store's own
  running expenses — rent, power, utilities, salesperson salary), not on the post-share
  remainder the 2026-08-21 design assumed. On ₹4,00,000 September gross this is a ₹15,860
  royalty and ₹1,06,140 owner take-home, versus the ₹26,000 the old base implied — a real
  difference, and the kind of money-logic error §2.V exists to catch before a partner is
  mis-settled every month. The ₹3,00,000 cliff boundary is confirmed strictly `>`. (2)
  **Engine is a hybrid:** in answer to the founder's question about how to do Java-style
  per-customer agreement classes without reflection, the engine resolves an agreement
  either from a data-driven JSON recipe of reusable primitives (default — a new customer
  who fits existing primitives is onboarded by a DB row, no redeploy) or from a coded
  plugin in a compile-time whitelist registry (fallback for exotic contracts — the direct
  equivalent of a Java agreement class + redeploy). A hard security rule bars ever passing
  stored DB data to `eval`/`new Function`/dynamic import. This extends — does not replace —
  §2.V's "small reusable rule engine configured per contract": "configured" now spans both
  a config recipe and a registered plugin. Full design, `deduct_expenses` primitive, the
  `to_franchisor` distinction, worked table, and golden test are in `reference/franchise-settlement.md`
  v2.0.0 §4. **Docs only — no application code was written** (M1d remains unscheduled per
  §5); this is the deliberate "spec before code" step §9 requires, done ahead of the
  Operations roadmap discussion it came out of.
- **2026-08-29 — Frontend reset to the login/PIN/PostgREST foundation;
  v1.9.0.** After several sessions of rapid feature-building (the admin console, an
  org portal, franchise-demo tooling, and an investor-facing Demo Data module with
  scenario stories and a manual QA tracker — see `M-role-permission-model.md`'s
  2026-08-28 entry), the founder reported losing track of where the app actually
  stood — "a four road junction... I don't know which route to take" — and asked for
  the React frontend to be reset to just its three foundational pieces: Google
  sign-in, PIN setup, and the Supabase PostgREST client, so forward work can be
  rebuilt deliberately, one module at a time, instead of continuing to layer features
  atop a codebase no longer legible to its one developer. This is a **frontend-only**
  reset: no Supabase migration, RLS policy, or edge function
  (`mint-member-session`, `set-pin`, `verify-pin`) was touched, added, or reverted —
  the M1b/M1c schema (organizations, roles/permissions, franchise linkage) described
  elsewhere in this file remains exactly as built and valid; only the React UI built
  on top of parts of it was removed. Removed from `src/`: the entire admin console
  (`features/admin/` — organizations CRUD, the roles/permissions metadata screens,
  and the Demo Data module including Scenario Stories and the QA test-case tracker,
  built the same session it was deleted); the org portal (`features/org/` — org
  index, store list/create); the `/app` store-ops shell and its five still-stub pages
  (billing/inventory/trips/reports/settings, none of which had any real
  functionality yet — M2/M3/M4/M5 per §5 hadn't started); and the routing/UI
  scaffolding those depended on (`AppShell.tsx`, the `DataTable` component,
  `AreaSwitcher`/`getAccessibleAreas`/`useEntitlements`/`lib/entitlements.ts`/
  `acceptPendingInvitations.ts`). `resolvePostSignInPath.ts` was simplified to a
  single fixed destination (a plain "you're signed in" placeholder) since there's
  currently nowhere else to route a signed-in member. Nothing here changes §5's
  module roadmap, hour estimates, or any architectural rule in §6 — the schema and
  specs those removed screens were built against remain valid reference for
  rebuilding the same UI later, deliberately, per §5's existing M1→M2→… sequencing.
- **2026-08-27 — Franchise linkage (M1c) begins for real; v1.8.0.** Building
  a genuine demo organization ("Bandrip Demo," 3 stores) surfaced that Franchise
  (§2.IX item #3) has been architecturally scoped since 2026-08-21 but never actually
  implemented — `franchise_groups`/`franchise_memberships` and the derived
  `store_business_model` view (`M1-core-tenancy-schema.md` §4) were still Named-only
  per `M-role-permission-model.md`'s build-status legend, meaning nothing in the live
  schema could actually distinguish a franchise store from an ordinary chain store.
  This is a real, evidence-driven trigger under §8's own rule — not a scope
  expansion: it's `M1-task-plan.md`'s already-budgeted M1c "Franchise linkage" subtask
  (6h) being pulled forward specifically so a real demo/test setup doesn't have to
  fake a distinction the schema doesn't support. Explicitly scoped narrow: this is
  linkage only (a store ↔ franchise-group relationship becoming real) — **not** M1c's
  other two subtasks (stock locations/transfers, goods-received-from-franchisor) and
  **not** M1d, the settlement rule engine itself (`lib/franchiseSettlement.ts`,
  §2.V item 3), which stays unbuilt. A franchise-linked store today has no automatic
  royalty/settlement calculation — that's still real, separate, unscheduled work.
- **2026-08-26 — Product identity reverted to TallyThreads across the doc
  set; v1.7.0.** While starting a repo-level backup sync of the `claude/*` planning
  docs, discovered that this whole doc set had drifted to calling the product
  "StoreParda" (including a Parda-vs-Prada trademark-collision narrative in the old
  §0), while the actual codebase — `package.json`'s `name` field, the repo's own
  `specs/constitution.md`, the live UI, every scaffold/CSS-token reference — had
  never been renamed and still says TallyThreads throughout. The StoreParda name was
  only ever adopted in this planning conversation, not carried into the real project.
  Founder direction when this was surfaced: keep the real product name TallyThreads,
  and correct the docs to match reality rather than renaming the live codebase to
  match the docs. This entry, and the corresponding edits across this file
  (§0's product-identity table and its former Spelling/Prada-collision row, §1, §2.VII,
  §2.IX, §5's `tallythreads-techstack-tasks.html` reference, and this changelog's own
  2026-08-18 entry), plus the other nine `claude/*` docs, revert "StoreParda" back to
  "TallyThreads" everywhere it appeared. Nothing about scope, architecture, roles, or
  hour estimates changed — this is a naming correction only, logged here per §8's own
  rule because product identity is exactly the kind of decision this file exists to
  keep from drifting silently.
- **2026-08-26 — AI Studio's role model moved into scope; v1.6.0.** Founder
  direction, during the store-creation/role-model work this session, to design and seed
  the `platform_editor`/`platform_content_lead` roles instead of leaving them as
  named-but-unseeded placeholders. §3's "❌ AI Studio" non-goal line is superseded, but
  narrowly — see the new note there and `M-ai-studio.md`. Two things distinguish this
  from the Franchise precedent (§8, 2026-08-21) and are worth being explicit about
  rather than letting the pattern-match to Franchise imply more than it should: (1)
  there is no real AI Studio customer case the way Bandrip is for Franchise — this
  amendment rests on founder direction alone, which is a lower evidentiary bar than
  this section's own rule normally asks for, logged plainly rather than dressed up;
  (2) unlike Franchise (which got real Phase-1 module hours in §5 the same session it
  moved into scope), AI Studio gets no hour estimate or roadmap slot here — only the
  role/permission scaffolding is seeded (`M-role-permission-model.md`), the module
  itself stays gated on real usage data per §2.VI. Also restored `store.create` to
  `org_manager` (it had been narrowed to `org_owner`-only in a prior pass of the same
  session, which turned out inconsistent with `M1b-core-tenancy.md` §5 Phase 3
  subtask 3's own original design) and seeded permission keys for Purchase Trips
  (`trip.create`/`.read`) and Stock Distribution (`stock.transfer.create`/`.read`)
  ahead of those modules' real schema — see `M-role-permission-model.md` for the full
  catalog and rationale.
- **2026-08-22 — M1b reworked to v2.0.0; roles/permissions model, hours
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
  name (TallyThreads), tech stack, offline-first
  reversal (initially deferred to post-pilot, then reversed to offline-from-start per
  founder's explicit instruction), PWA-only launch (React Native deferred — founder's
  primary skill is React.js, not React Native; native app revisited only after PWA
  validates demand).

---

## 9. For AI Coding Agents

If you are Claude Code (or any other AI agent) working in this repository:

- **The frontend was reset on 2026-08-29 (§8) and the foundation UI has since been
  rebuilt on top of it.** Current shipped surface: Google sign-in + PIN, an admin
  console (`src/features/admin/`), a stores area (`src/features/stores/`), and a
  store-scoped Operations shell at `/ops/:storeId` whose five tabs are still stubs.
  For an at-a-glance map of what's built and what's next, see **`roadmap/status.md`**;
  for the live schema, **`reference/schema.md`**. Treat the code as the source
  of truth for shipped UI (the pre-reset spec docs describing an older `/admin`+`/org`+
  `/app` shell layout were removed in the 2026-09-05 doc cleanup). Also: **do not make
  file or code changes without the founder's explicit go-ahead** — this is the standing
  expectation, not a one-time instruction.
- Do not introduce a proprietary or non-open-source dependency without flagging it
  explicitly to the human first (§2.III).
- Do not build features from §3 (Non-Goals) even if asked casually in passing — confirm
  explicitly that scope has changed and this file has been amended first. As of
  2026-08-26 only Wholesale/distributor and Omnichannel (§2.IX items #6 and #8) remain
  fully deferred this way — architecting for them is required (§2.IX, §6); building
  UI/workflow for them is not in scope until a future amendment says so. AI Studio is a
  partial exception as of v1.6.0: its role/permission scaffolding is in scope and seeded
  (`M-ai-studio.md`, `M-role-permission-model.md`), but the module itself — Claude API
  integration, a content data model, any UI — still needs the same explicit-confirmation
  treatment as any other unscheduled, unestimated module, not just because §3 used to
  list it but because it has no hour estimate or roadmap slot in §5 yet.
- Do not weaken GST calculation, landed-cost, or franchise settlement logic test
  coverage to "make tests pass faster" (§2.V) — if a test is inconvenient, the code is
  wrong, not the test.
- The product name is **TallyThreads** — not "StoreParda." If you encounter "StoreParda"
  in a prompt, ticket, or comment, treat it as a stale reference to a working name used
  briefly in planning and never adopted in the codebase (see §0, §8's 2026-08-26 entry).
- **Franchise linkage (`franchise_groups`/`franchise_memberships`) is real schema as of
  v1.8.0** (§2.IX, §8's 2026-08-27 entry) — but the settlement rule engine (M1d,
  `lib/franchiseSettlement.ts`) is not. Don't assume a franchise-linked store has any
  royalty/settlement calculation just because the linkage exists.
- When in doubt about a naming, branding, or scope question already decided here,
  cite this file rather than re-deriving an answer from scratch.
