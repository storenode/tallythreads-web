# M4 + M2-core — Purchase-Trip, Offline-First with Sync

**Status:** Draft for review (not started — do not implement until the founder says go)
**Version:** 0.2.0
**Est:** ~50 hrs — Purchase-Trip domain/engines/UI (~24h) + a first real offline sync
core (~26h, a slice of M2's 62h, proven by this module). AI expense estimator (Phase 2)
and the store-facing incoming view add on top; see §3.
**Tracking:** open a GitHub issue when this moves to a scheduled build (`workflow.md`)
**Parent docs:** `../constitution.md` §2.I (offline-first), §2.IV (Purchase-Trip is the core
differentiator), §2.V (money logic must be tested), §5/§6/§7, §8 (the amendment this needs);
`../reference/schema.md`; `../reference/franchise-settlement.md` (the recipe/plugin pattern
the margin engine reuses); `../reference/roles-and-permissions.md` (`trip.create`/`trip.read`);
`backlog.md` (break-even/ROI forecast is parked there).

> **Decisions on record (2026-09-05):** (1) build **offline-first with Dexie + a real sync
> loop** (Option B) — pulls **M2's sync core** forward, built *through* Purchase-Trip as its
> first consumer. (2) A trip has a **planning phase** (route + budget + expense estimate +
> forecast) *and* an **actuals phase** (invoices + real expenses + landed cost). (3)
> **Provisioned from the organization dashboard**; store staff get a **price-free**
> "incoming stock" read only. (4) **Break-even/ROI forecast is deferred to `backlog.md`.**
> (5, 2026-09-05) The **route is a multi-leg table** (From/To/Boarding/Drop-point/**Distance
> km (required)**/Mode/Price) with add/edit/delete — Distance is required, which nudges the
> owner to open the map link to read it; **all budgets are manual entry** in planning (goods budget + estimated
> expenses), and **actual expenses are entered at trip time** (`trip_expenses`), so the two
> can be compared. **Location capture is our own text fields + a Mode dropdown** (Car/Bus/
> Train/Bike/Walk). For the map, the app **generates a free Google "Maps URLs" verify-link**
> from the entered From/To/Mode (`https://www.google.com/maps/dir/?api=1&origin=…&
> destination=…&travelmode=…`) — **no API key, no Embed API, no billing**; the owner clicks
> "Verify on map ↗" (opens Maps in a new tab / the app on mobile) to eyeball their entry.
> This is typo **detection by human check**, not auto-correction. **No** Google Places
> autocomplete, **no** paste-and-parse, **no** hotel discovery/pricing (all → `backlog.md`).
> **Claude (Haiku)** will estimate budgets in **Phase 2** (server-side, capped ≈$5/mo).
> Requires a constitution §5/§8 amendment (§16).

---

## 0. What this is

The module a garment-store owner uses across a **buying trip's whole life**:

- **Before the trip (plan/forecast):** create a trip with dates and a **route**, set a
  **purchase budget**, get an **expense estimate** (manual in Phase 1; AI-assisted in Phase
  2), and see a simple **investment → projected-return forecast** so they can decide how
  much to commit before they travel.
- **During/after the trip (actuals):** record the real **supplier invoices** and their line
  items, the real **trip expenses**, and get the **true landed cost per item** (expenses
  distributed) plus a **suggested MRP** from a **pluggable margin strategy** (modest on
  staples, boosted on trending/seasonal stock).

This is the constitution's core differentiator (§2.IV) — no competitor (QueueBuster, Vyapar,
GoFrugal) offers landed-cost-from-a-buying-trip, let alone pre-trip forecasting.

**Org-type independent (§2.IV):** a trip attaches to *whoever sources stock* — an independent
owner (Vasavi/Nellore/Tirupati), a chain's central buyer, or a franchisor (Bandrip
Corporate). A franchise *branch* doesn't create trips (it receives goods — M1c); the
sourcing **organization** does. So the module keys off the sourcing organization, never an
org "type" label.

## 1. Why offline-first + PWA (the real usage)

TallyThreads is a PWA. Sales staff teach store owners to **install it** ("Add to Home
Screen" on Android/desktop) and use it like a native app. A buying trip happens on the road
— patchy or no network in a wholesale market or on a train. So **every write goes to local
Dexie first and syncs when a connection returns** (§2.I). This module is built offline-first
from day one and is the first real consumer of the **sync core** (M2).

## 2. Trip lifecycle

```
planning  ──▶  active  ──▶  completed
(route,        (recording      (landed cost + MRP finalized;
 budget,        real invoices   later: stock distributed to
 estimate,      & expenses)     stores via M1c, sold via M5)
 forecast)
```

- **planning:** dates + route + planned budget + estimated expenses + forecast. Editable
  offline; the AI estimate (Phase 2) runs when online.
- **active:** real supplier invoices, line items, and actual trip expenses are entered.
- **completed:** landed cost + suggested MRP are finalized for the trip.

Both the estimate (planning) and the actuals are stored, so a later phase can compare
"estimated vs actual" (a learning loop — not built now).

## 3. Scope

**In scope — Phase 1 (offline-first, pure-logic, no AI):**
- Trip lifecycle + planning: a **multi-leg route table** (From/To/Boarding/Drop-point/
  **Distance km — required**/**Mode dropdown**/Price, add/edit/delete), each leg with a
  generated **"Verify on map ↗"** link (free Google Maps URL from From/To/Mode — no key,
  opens a new tab for the owner to eyeball; required Distance nudges them to open it). Each
  leg also takes a **planned purchase amount** ("cart"); a **Cart + Wallet summary** shows the
  cart total vs the goods budget and the **cash to carry** (cart + estimated expenses). A
  **manual** goods budget and a **manual** estimated-expenses figure (the route legs' price
  sum is shown as a travel reference / can prefill it — the forecast counts
  `estimated_expenses_paise` once, never double).
- Actuals: supplier invoices, lightweight line items (with a trending flag), trip expenses.
- `lib/landedCost.ts` — landed-cost engine (TDD).
- `lib/purchaseMargin.ts` — margin/MRP engine, **hybrid recipe/plugin** (TDD).
- `lib/tripForecast.ts` — investment → projected-return forecast (TDD). **Break-even/ROI is
  NOT here — it's parked in `backlog.md`.** Phase 1 forecast = investment (budget +
  estimated expenses) and projected revenue/profit at the expected margin, labeled clearly
  as an *estimate*.
- **Offline sync core** (Dexie ⇄ Supabase push/pull, LWW) — generic, delivered and tested
  through these tables.
- **Visibility split** (§10): org-dashboard full view + a store-dashboard **price-free**
  incoming-stock read.
- **PWA installability + offline app shell** for this flow.
- Demo data + a demo scenario + QA cases.

**In scope — Phase 2 (needs online):**
- **AI expense estimator** — a Claude Edge Function that estimates travel/lodging/food/
  transport from the route + dates (server-side key only). The first real Claude API use;
  produces an *editable estimate*, not a fixed value.

**Explicitly OUT of scope (seams to later modules / backlog):**
- ❌ **Break-even / ROI forecast** → `backlog.md` (needs real sell-through data from M5).
- ❌ Line items → stock-on-hand / inventory, variant matrix, barcode — **M3**.
- ❌ Sales / billing / GST / realized margin — **M5**.
- ❌ Which store each trip stocks (per-store allocation) — **M1c** (goods-received /
  stock-transfer). Phase 1's store-facing view is org-wide, not per-store (§10).
- ❌ A suppliers master table — supplier is free-text in Phase 1.
- ❌ Full M2 hardening (conflict UI, background-sync tuning, batching) and Supabase Realtime
  live push — Phase 1 builds a *correct* sync loop, not the whole 62h M2.

## 4. Architecture — offline-first data flow (reuses `src/db/`)

The existing Dexie scaffold has the right shape and is reused:
- `SyncMeta` = `{ _localId, _dirty, last_modified_at, deleted_at }` on every synced row.
- An `outbox` table of queued `insert|update|delete` ops with retry `attempts`.
- Already used by `products`/`invoices` (M3/M5 scaffolds).

**Write path (offline-first, §2.I):** every create/update/delete writes to Dexie first
(`_dirty=1`, stamps `last_modified_at`, soft-deletes via `deleted_at`) **and** enqueues an
`outbox` item. The UI reads from Dexie, so it works fully offline.

**Sync core (the M2 slice this module delivers):**
- **Push:** when online, drain `outbox` → upsert to Supabase via `supabase-js` (RLS
  enforces auth); store the returned server `id` against `_localId`, clear `_dirty`.
- **Pull:** fetch rows changed since a per-table `last_modified_at` watermark → merge.
- **Conflict:** last-write-wins by `last_modified_at` (§6) — no manual merge UI.
- **Ids:** client `_localId` (uuid) for optimistic UI; server `id` assigned on first push.
- **Soft delete only** (§6). **Trigger:** on `online` event + app foreground + light
  interval + manual "Sync now" (cadence — open question §15).
- Supplier invoice numbers are the *supplier's* (stored as data); the §6
  `{store}-{device}-{seq}` scheme is for *sales* invoices (M5), not here.

## 5. Data model

Supabase tables below; the **Dexie mirror carries the same columns plus `SyncMeta`**. Money
in **integer paise**; all follow §6 (`last_modified_at`, `deleted_at`).

```sql
create table purchase_trips (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),   -- the SOURCING org
  created_by        uuid not null references members(id),
  title             text not null,            -- e.g. "Surat — Aug 2026"
  status            text not null default 'planning'
                      check (status in ('planning','active','completed')),
  -- planning
  start_date        date,
  end_date          date,
  route             jsonb,                    -- [{from, to, boarding, drop_point,
                                              --   distance_km, mode, price_paise}]
                                              -- multi-leg planning table. `distance_km` is
                                              -- REQUIRED in the form (nudges the owner to
                                              -- open the map link to read it). The "Verify
                                              -- on map" link is GENERATED from from/to/mode
                                              -- at render (free Google Maps URL), not
                                              -- stored. No migration — it's jsonb.
  planned_budget_paise      bigint,           -- how much owner intends to spend on goods
  estimated_expenses_paise  bigint,           -- planned trip expenses (manual or AI)
  expense_estimate_source   text check (expense_estimate_source in ('manual','ai')),
  expected_margin_pct       numeric,          -- for the forecast; default from margin engine
  notes             text,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

create table purchase_invoices (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references purchase_trips(id),
  supplier_name     text not null,            -- free-text in Phase 1 (no suppliers master)
  supplier_gstin    text,
  supplier_invoice_no text,
  invoice_date      date,
  margin_config     jsonb,                    -- recipe (§7); or…
  margin_plugin_id  text,                     -- …a coded plugin key (at most one)
  notes             text,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint purchase_invoices_one_margin_source
    check (margin_config is null or margin_plugin_id is null)
);

create table purchase_invoice_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references purchase_invoices(id),
  description       text not null,            -- model/style; becomes a product in M3
  hsn_code          text,                     -- optional; GST detail deferred to M5
  quantity          integer not null check (quantity > 0),
  unit_cost_paise   bigint not null check (unit_cost_paise >= 0),
  is_trending       boolean not null default false,   -- drives the boosted margin
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

create table trip_expenses (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references purchase_trips(id),
  category          text not null
                      check (category in ('travel','lodging','food','transport','other')),
  amount_paise      bigint not null check (amount_paise >= 0),
  note              text,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);
```

Landed cost, suggested MRP, and the forecast are **derived** (computed by §6/§7/§8), not
stored in Phase 1 — recomputed from the rows above.

**Price-free store view (§10):** a read-only DB view exposing ONLY non-financial columns to
store staff, e.g.:
```sql
create view incoming_stock as
select t.id as trip_id, t.organization_id, t.status, t.end_date as expected_by,
       i.description, i.quantity                       -- NO cost / MRP / margin / budget
from purchase_trips t
join purchase_invoices pi on pi.trip_id = t.id and pi.deleted_at is null
join purchase_invoice_items i on i.invoice_id = pi.id and i.deleted_at is null
where t.deleted_at is null and t.status in ('active','completed');
```
(Exact columns — whether `quantity` is exposed — is open, §15.)

## 6. Landed-cost engine — `lib/landedCost.ts` (pure, TDD, §2.V)

Distributes the trip's total expenses across every item bought, producing a true landed unit
cost.
- **Basis (default): by value.** Each item's expense share ∝ its line value
  (`quantity × unit_cost_paise`) over the trip's total goods value. Configurable
  (`value` | `quantity`), per trip. *(Confirm — §15.)*
- `landed_unit_cost_paise = unit_cost_paise + round(item_value_share / quantity)`.
- Integer-paise only; distributed shares must **sum back exactly** to total expenses
  (allocate rounding remainder deterministically, like `gstCalc.ts`).

**Golden tests:** the §13 demo trip with exact expected landed costs; edges — single item,
zero expenses, qty 1, rounding-remainder reconciliation.

## 7. Margin / MRP engine — `lib/purchaseMargin.ts` (hybrid recipe/plugin, TDD)

Reuses the settlement pattern (`franchise-settlement.md` §4.5): each invoice resolves margin
from a **data-driven recipe** (`margin_config`) or a **coded plugin** (`margin_plugin_id`) in
a whitelist registry — never `eval` on stored data.
- Recipe primitives (Phase 1): `flat_margin(pct)` (staples, e.g. 20%);
  `trending_margin(base_pct, trending_pct)` (items with `is_trending=true` get the boosted
  rate, e.g. 60%).
- `suggested_mrp_paise = round(landed_unit_cost × (1 + margin_for_item))`.

**Golden tests:** staples-only flat; a trending lot boosted while staples stay at base; a
plugin-resolved invoice; rounding.

## 8. Trip forecast engine — `lib/tripForecast.ts` (pure, TDD)

The pre-trip decision aid. **Estimate only — labeled as such in the UI, never a guarantee.**
- `planned_investment = planned_budget_paise + estimated_expenses_paise`.
- `projected_revenue  = planned_budget_paise × (1 + expected_margin_pct)`.
- `projected_profit   = projected_revenue − planned_investment`.
- **Break-even date / ROI-to-pocket is NOT computed here — it's parked in `backlog.md`**
  (needs a sell-through assumption now, and real sales data from M5 to be accurate).

**Golden tests:** a worked forecast for the demo trip's planned figures; zero-estimate and
zero-margin edges.

## 9. Statistics

**Per trip:** total goods cost, total expenses, total landed cost, blended margin %,
projected revenue at MRP, projected profit, item count, trending-vs-staple split.
**Cross-trip (basic):** spend per supplier, spend per month/season.
**Planned vs actual (detail page):** estimated travel (route legs' price sum) + planned
`estimated_expenses` vs **actual** `trip_expenses` entered at trip time — so the owner sees
how the plan held up. Computed from Dexie rows (instant, offline). *Cross-device live* stats
need Supabase Realtime — a later enhancement; Phase 1 refreshes on sync.

## 10. Visibility — organization dashboard vs store dashboard

A trip holds two very different kinds of information, and the split is a **security
requirement**, not just UI:

| Information | Who can see it |
|---|---|
| Costs, landed cost, margin, MRP, budget, estimated expenses, forecast | **Owner / Manager only** (financial) |
| What stock is coming and when (models + expected date, maybe qty) | **Sales staff too** (to tell customers) |

- **Organization dashboard (`org_owner` / `org_manager`):** create/manage trips and see
  **everything**, including all financials. This is where a trip is provisioned.
- **Store dashboard (`store_sales_staff` / `store_temp_staff`):** a **read-only, price-free
  "Incoming Stock" view** — trip status, expected arrival date, models/styles (+ qty, open
  §15). **No** cost, landed cost, MRP, margin, budget, expenses, or forecast.

**Enforced server-side, not by hiding in the UI:** store staff read the **price-free
`incoming_stock` view** (§5) — the financial columns are not in it at all, so nothing leaks
to the client. RLS gates it by the store staff's organization.

**Permissions:**
- `trip.create` / `trip.read` — already seeded for `org_owner` / `org_manager` (full,
  financial). No change.
- **`trip.view_incoming`** (NEW) — the price-free read, granted to `store_sales_staff` /
  `store_temp_staff` (and `store_manager` when seeded). *(Name — open §15.)*

**Store-linkage nuance:** *which* store a trip stocks is the distribution step (**M1c**). So
Phase 1's incoming view is **org-wide** (every incoming trip for the org's stores);
**per-store** "coming to *my* store" arrives with M1c. This keeps Phase 1 useful without
over-building. RLS on `purchase_*`: `is_platform_admin() or has_org_permission(
organization_id, 'trip.read')` for the org roles; the `incoming_stock` view is gated by
`trip.view_incoming` for that org's store members.

## 11. PWA / installability

Stack already has `vite-plugin-pwa` (Workbox) + `workbox-window`. DoD verifies, for this
flow: a valid **manifest** (name, icons, `display: standalone`); **installable** on Android
Chrome + desktop with a light in-app **install prompt**; **app shell + trip routes
precached** so an installed app records a trip **offline**. (iOS Safari: home-screen web app;
the §4-constitution Bluetooth/Barcode limits don't apply — no scanning here.)

## 12. UI

- **Organization dashboard — Purchase-Trip area:** trip list (with sync-status per row);
  trip detail with two tabs/sections — **Plan** (dates, route, budget, expense estimate,
  forecast) and **Actuals** (invoices + line items with the trending toggle + expenses +
  the running landed-cost/MRP table + summary stats). Every screen shows an **offline/sync
  indicator** (synced ✓ / pending ↑ / offline).
- **Store dashboard — "Incoming Stock":** a simple read-only list from `incoming_stock` —
  models + expected date (+ qty, open) — no money anywhere.

## 13. Demo data & the acceptance demo

Reuse the existing Demo module (`src/features/admin/demo/`; provisions real Independent
(Vasavi/Proddatur), Chain, Franchise (Bandrip/Kadapa+4) orgs). Extend with a seeded trip, a
`demo_scenarios` narrative, and `qa_test_cases`.

**Demo script (org-independence + offline + landed-cost + margin plugin + visibility):**
On **Vasavi (independent)**, from the **org dashboard**, record a **Surat trip**:
- Invoice A — staple cotton lot: qty 100 @ ₹200 → **flat 20%** margin.
- Invoice B — **trending** silk-blend lot: qty 40 @ ₹800 → **boosted 60%** margin.
- Trip expenses: bus ₹3,000 + hotel ₹4,000 + transport ₹2,000 = **₹9,000**.
Show: **landed cost per item** (₹9,000 distributed by value), **suggested MRP** (20% vs 60%),
the **plan forecast** (investment vs projected profit), and the **trip summary**. Then the
**offline round-trip:** network off, add an expense → saves + UI updates; network on → it
appears in Supabase (§7 DoD). Finally, sign in as **sales staff** → the **Incoming Stock**
view shows models + date but **no prices** (proves the visibility split). Repeat briefly on
**Bandrip Corporate** for franchisor sourcing.

## 14. Definition of Done

- [ ] `landedCost`, `purchaseMargin`, `tripForecast` engines unit-tested (§2.V), incl. the
      demo golden cases + rounding reconciliation.
- [ ] Offline-first: every write goes to Dexie + outbox first; the whole flow works with the
      network disabled (§2.I).
- [ ] **Sync round-trip verified (§7):** create offline → reconnect → rows confirmed in
      Supabase; a conflicting edit resolves last-write-wins.
- [ ] **Visibility enforced server-side:** store staff hit `incoming_stock` and **cannot**
      retrieve any cost/MRP/margin/budget/forecast field by any query (verified directly,
      not just hidden UI); no cross-org leakage.
- [ ] RLS: a member without `trip.*` on the sourcing org can't read/write its trips.
- [ ] PWA installable (Android + desktop); launched-from-install, a trip records fully
      offline.
- [ ] 375px manual check (§7).
- [ ] Demo: the §13 script runs end-to-end on Vasavi; demo scenario + QA cases seeded.

## 15. Open questions

1. **Landed-cost basis** — confirm **by value** (default) vs quantity, configurable per trip.
2. **Store view fields** — show **quantity** to sales staff, or only models/styles + date?
3. **`trip.view_incoming`** — confirm the permission name.
4. **Store view scope** — org-wide incoming list in Phase 1 (per-store waits for M1c) — ok?
5. ✅ **Resolved (2026-09-05):** Route is a **multi-leg table** (From/To/Boarding/Mode/Price).
   Budgets are **manual** in planning; actuals at trip time. Map = a **generated free Google
   Maps verify-link** (no key, no paste-parse). Places/Photon autocomplete + hotel discovery
   → `backlog.md`.
6. ✅ **Resolved:** AI budget estimator stays **Phase 2** (Claude/Haiku, server-side).
7. **Sync cadence** — `online` + foreground + interval + manual; what interval?
8. **Supplier** — free-text now; when is a `suppliers` master worth it?
9. **MRP → sales seam (M5)** — design how suggested MRP later becomes sale price / realized
   margin (design the seam, don't build).

## 16. Constitution impact (amendment required)

Option B **reorders §5**: M2 (offline sync) was to be stable *before* M4; instead we build
**M2's sync core alongside M4**, with Purchase-Trip as its first consumer — more faithful to
§2.I and a better way to build M2 (proven against a real feature, satisfying §7's
sync-round-trip DoD). Also records that Purchase-Trip now includes a planning/forecast phase
and a store-facing price-free view. Needs a §8 changelog entry + a §5 note. **To be applied
on spec approval** (or now, if preferred) — a deliberate, evidence-backed reorder, not drift.

## 17. Changelog

- **v0.3.3 (2026-09-05)** — Added per-leg **`planned_purchase_paise`** (the "cart" — how much
  to buy at each location) and a trip-level **Cart + Wallet readout** shown in the **Route
  card header, right-aligned, borderless/plain** (not a highlighted box): **Cart** = Σ leg
  purchases
  (vs the goods budget → under/over difference), **Cash to carry (Wallet)** = cart + estimated
  expenses. Leg shape now
  `{from,to,boarding,drop_point,distance_km,mode,price_paise,planned_purchase_paise}` (jsonb,
  no migration). `legsPurchaseTotalPaise` in `legs.ts`; `CartWalletSummary` component.
- **v0.3.2 (2026-09-05)** — Added per-leg **`drop_point`** (optional) and **`distance_km`
  (required)** to the route leg. Distance is form-required as a **nudge**: the owner opens the
  generated Verify-on-map link to read the distance. Leg shape now
  `{from,to,boarding,drop_point,distance_km,mode,price_paise}` (jsonb, no migration). Offline
  still fine — they can type an estimate. Implemented in `RouteLegsTable` + create/detail
  validation (`areLegsValid`/`isLegComplete` in `legs.ts`).
- **v0.3.1 (2026-09-05)** — Map approach finalized: each leg gets a **generated free Google
  "Maps URLs" verify-link** from From/To/Mode (no API key, no Embed API, no paste-and-parse)
  — human eyeballs it to validate. Leg shape is `{from,to,boarding,mode,price_paise}`; the
  link is generated at render time, not stored. Photon/Places autocomplete stays the deferred
  auto-correction upgrade in `backlog.md`.
- **v0.3.0 (2026-09-05)** — Route becomes a **multi-leg table** (From/To/Boarding/Mode/Price,
  add/edit/delete) in `route` jsonb (no migration). **All budgets manual** in planning;
  **actual expenses at trip time** (`trip_expenses`) with a **planned-vs-actual** panel (§9).
  **Hotel discovery / Places autocomplete / real hotel prices → `backlog.md`.** **Claude/Haiku
  budget estimate confirmed Phase 2.** Resolved open questions 5–6.
- **v0.2.0 (2026-09-05)** — Added the **planning/forecast phase** (trip lifecycle
  planning→active→completed; route, budget, manual expense estimate, `lib/tripForecast.ts`;
  AI estimator moved to Phase 2) and the **visibility model** (org dashboard = create +
  financials; store dashboard = price-free `incoming_stock` view; new `trip.view_incoming`
  permission; server-side enforcement). Break-even/ROI moved to `backlog.md`. Updated data
  model, DoD, open questions, constitution-impact note.
- **v0.1.0 (2026-09-05)** — Initial draft: Option B (offline-first + sync core through
  Purchase-Trip), org-independent framing, landed-cost + hybrid-margin engines, PWA, demo.
