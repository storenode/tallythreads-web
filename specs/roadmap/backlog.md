# Backlog — deferred & parked ideas

Ideas that are agreed to be worth doing but **deliberately postponed** — not open questions, not
active scope. Each item says what it is, why it's parked, its **priority**, and what would trigger
building it. Pull an item out of here into a real spec/phase when its trigger hits.

**Ordered by priority — highest first.** Within a tier, the earlier item is the one to reach for
first. (`Priority` line on each item is the source of truth if this order drifts.)

---

# ▲ Medium priority

## Inventory: godown + quantity-vs-store distribution

**What:** When a Purchase-Trip parcel is `ready_for_inventory`, let the owner **allocate each
SKU's received quantity across the org's stores** (quantity-vs-store) — optionally **holding
stock in a godown** (warehouse) first and transferring to stores later. Reuses the unified
`stock_locations` tree ("a godown is just a location") and the many-to-many SKU↔location model.

**Use case / why it matters:** a **multi-store org distributes one purchase lot across branches**
— Bandrip's four stores, Sri Lakshmi's three — so 80 kurtis become 20/20/20/20. This is core to
the **franchise/chain target market** (Bandrip itself is a franchise with 4 stores). A
single-store org just allocates everything to its one store.

**Why parked (2026-09-13):** the first Inventory cut is **single-store direct intake** (SKU +
barcode + stock into one store); the godown-hold + multi-store split is **Phase 2 of Inventory**.
The data model (unified locations, multiple locations per SKU) already accommodates it.

**Priority: Medium** — required for the multi-store/franchise target, but only after single-store
Inventory works and the app is validated on one store. Ranks at the top of Medium because the
launch customer (Bandrip) is multi-store.

**Trigger to build:** core single-store Inventory ships **and** a multi-store org needs to
distribute a trip's goods across branches.

**Related:** `stock-placement.md` (unified location tree; multiple-locations-per-SKU); the
deferred M1c `stock_transfers` concept; `deliveries.md` (`ready_for_inventory` hand-off).

---

## Sync: outbox retry backoff + dead-letter surfacing

**What:** The push engine (`syncEngine.ts` → `pushEntry`) keeps a failed outbox entry and just
increments `attempts`; every sync cycle retries it forever with no delay and no ceiling. Add
(a) an **exponential backoff** so a repeatedly-failing entry is retried less often instead of
on every 45s cycle, and (b) a **dead-letter / surfaced-error** path so an entry that has failed
past a threshold is flagged (not silently retried), with the error visible to the user (e.g. via
the existing `SyncStatus.lastError` / a sync UI) so a genuinely stuck write can't hide.

**Use case / why it matters:** a write that the server will *never* accept — an RLS denial after
a role change, a validation error, a permanently orphaned FK — currently loops silently every
cycle: it never drains, never errors loudly, and quietly wastes a request each time. The owner
has no signal that a parcel status or invoice edit never actually reached the server. Backoff
also stops a batch of doomed entries from hammering the endpoint on a flaky connection.

**Why parked (2026-09-12, verified working without it):** end-to-end offline sync is functioning
— offline writes queue, reconnect drains, confirmed round-trip to Supabase. Retry-forever is
harmless at the current single-founder / demo scale (entries do eventually succeed once the
parent/network recovers), so this is hardening, not a fix.

**Priority: Medium** — touches money/stock correctness *visibility* and real-user trust, but not
blocking, since sync works today and the failure mode only bites at multi-user scale or on
permanent server rejections. Build before onboarding real concurrent staff (multi-device).

**Trigger to build:** first real multi-user / multi-device usage, OR the first observed
permanently-stuck outbox entry in the wild, OR any sync UI work that would show `lastError`.

**Related:** `src/sync/syncEngine.ts` (`pushEntry`, `drainOutbox`), `src/sync/useSync.ts`
(45s interval + reconnect triggers), `SyncStatus.lastError`; constitution §2.I.

---

## Purchase-Trip: AI trip-budget estimator (planning phase)

**What:** An "Estimate with AI ✨" button in the *planning* phase — sends the route legs
(from/to/mode/distance) + dates + party size to a server-side Claude (Haiku) function that
returns an itemized INR estimate (travel/lodging/food/local transport) to prefill
`estimated_expenses`. Editable, labeled "AI estimate", never a guarantee.

**Why parked (2026-09-06, founder decision):** needed, but not immediate — the priority was
completing the Purchase-Trip **active phase** end-to-end first. The active phase's Claude use
(receipt → JSON) is the higher-value first AI integration; the planning estimator comes after.

**Priority: Medium** — a genuinely wanted feature that reuses the Claude plumbing once the active
phase adopts it; do it after receipt-scanning ships.

**Trigger to build:** after the active-phase (receipt scanning) ships and the Claude API is
already adopted (key + §3/§8 amendment done) — the estimator then reuses the same plumbing.

**Related:** `purchase-trips.md` (planning phase; the receipt→JSON active-phase feature that
adopts the Claude API first).

---

## Stock Placement: copy a store's layout to another store

**What:** A "copy placement layout from another store" / template action so a store can adopt an
existing store's `stock_locations` tree (floors, sections, racks, zones) in one click, instead of
re-entering it by hand. Builds on `stock-placement.md`.

**Use case / why it matters:** a **chain or franchise** (our target: medium/bigger stores) often
has **near-identical layouts** across branches — e.g. Sri Lakshmi Textiles' three stores, or the
four Bandrip stores. Re-defining the same racks/sections per store is tedious and error-prone;
cloning one store's layout and tweaking is far faster.

**Why parked (2026-09-13):** not needed to launch a *single* store, and each store can define its
own layout by hand at first. It's a multi-store efficiency add, not a correctness gap — the data
model already supports it (just copy rows with new ids under the target `store_id`).

**Priority: Low–Medium** — rises with the number of similar stores per org; do it once real
chains/franchises are onboarding multiple branches.

**Trigger to build:** a chain/franchise onboards several similar stores and asks not to redo the
layout each time.

**Related:** `stock-placement.md` (the `stock_locations` tree this clones); the chain/franchise
demo orgs.

---

## Purchase-Trip: active-phase polish (small deferred items)

**What (grouped):**
- A **viewer** to open a scanned receipt's stored image (`purchase_invoices.receipt_path`)
  for audit — today the image is stored in the `receipts` bucket but there's no UI to view it.
- **Edit a scanned invoice's margin recipe** in the detail UI — manual "Add invoice" has the
  flat/trending picker, but a scanned invoice defaults to flat 20% with no post-hoc edit.
- **Storage cleanup** — delete the receipt image from the `receipts` bucket when its invoice
  is soft-deleted (avoid orphan images).
- **Per-member rate-limit** on `extract-receipt` — the ~$5 Anthropic spend cap + the
  `trip.create` gate already bound abuse; a per-member/day cap would harden it further.

**Why parked (2026-09-06):** none blocks the end-to-end flow; each is a refinement.

**Priority: Low–Medium** — quality refinements surfaced by real usage; batch them when the
Purchase-Trip module is next revisited.

**Trigger to build:** real usage surfaces the need (audit disputes → viewer; margin tweaks →
edit; storage bloat → cleanup; cost spikes → rate-limit).

**Related:** `purchase-trips.md` §2A; `supabase/functions/extract-receipt`.

---

# ▽ Low priority

## Sync: org-scoped pull (watermark filter by organization)

**What:** `pullTable` in `syncEngine.ts` fetches **every** changed row since the watermark
(`select * … gt last_modified_at`) across all orgs the member can see; RLS still enforces access,
but the client pulls and merges rows it may not need. Scope the pull query to the active
organization (and/or the trips the member actually works) so each cycle transfers only relevant
rows.

**Use case / why it matters:** a member who belongs to several organizations (or the platform
admin, who can see many) downloads and merges the full changed-row set on every 45s cycle —
wasteful bandwidth and Dexie writes on mobile/patchy connections, growing with the number of orgs
and total row churn. Org-scoping keeps sync cost proportional to what the user is actually
looking at.

**Why parked (2026-09-12):** correct and cheap at current scale — one founder, one active org,
small row counts. An efficiency/scalability concern, not a correctness bug (RLS already prevents
leaking other orgs' data into the UI).

**Priority: Low** — no user-visible impact today; purely a performance optimization that only
matters once there are many orgs or high row volume.

**Trigger to build:** members routinely span multiple orgs, sync payloads grow noticeably, or
mobile users report slow/expensive syncing.

**Related:** `src/sync/syncEngine.ts` (`pullTable`, `watermarks.ts`); constitution §2.I;
`reference/roles-and-permissions.md` (multi-org membership).

---

## Inventory: relocate stock between locations

**What:** Move a SKU's stock from one placement to another (rack A → rack B, godown → shelf) — a
**stock-movement** action that adjusts the per-`(SKU, location)` quantities. It is **not** a
change to the location list (that's Stock Placement); it moves *stock*, not *locations*.

**Use case / why it matters:** stores reorganise — goods shift from back-store to display, a
section is rearranged, a slow SKU moves to a clearance rack. Staff need to reflect that in the
system so on-hand-by-location stays accurate.

**Why parked (2026-09-13):** placement defines locations and intake places stock into them;
relocation is a later inventory operation, not needed to launch. The per-location stock model
(many-to-many) already supports it.

**Priority: Low** — a housekeeping operation that only matters after intake works and stores
start rearranging.

**Trigger to build:** stores report needing to move stock between shelves in-app.

**Related:** `stock-placement.md` (the location tree); the Inventory stock tables (per-location
quantity).

---

## Stock Placement: visual floor-map / planogram (position + shape)

**What:** A visual floor-plan view of a store's placement tree — each **floor**/**section** drawn
as a shape (square/rectangle) with position + size, racks shown as grid cells, so staff *see* a
map of the store and where stock sits, instead of reading a code list. Builds directly on the
`stock-placement.md` hierarchy (`Floor › Section › Rack/Zone`).

**Use case / why it matters:** in a **bigger, multi-section showroom** (a "Lee" area, a "Levi's"
area, across floors), a picture of the floor is faster for a new staffer than a code tree —
"where's the Lee section, and which rack in it" answered at a glance. It also opens the door to
merchandising/planogram planning later.

**Why parked (2026-09-13, founder decision):** it's a **heavy feature** — a canvas editor
(drag-drop, coordinate system, shape rendering) that would **delay the year-end Bandrip launch**,
and its geometry model is guesswork without the UI. And it isn't needed to *find* stock: the
hierarchy + the `row × column` grid already locate stock **logically** (a section is already a
rectangle of racks, just not drawn). The data door is already open — `stock_locations.layout`
(jsonb) is **reserved** for the geometry (`{shape, x, y, w, h}`), so building this needs **no
migration**.

**Priority: Low** — a visualization nicety with no user-visible gap at launch. Build only after
core Inventory ships.

**Trigger to build:** bigger/multi-section stores explicitly ask for a floor map, OR merchandising
(planogram) planning becomes a selling point — and only once core Inventory is stable.

**Related:** `stock-placement.md` (the hierarchy + the reserved `layout` column it feeds).

---

## Purchase-Trip: place autocomplete / typo auto-correction (Photon or Google Places)

**What:** As the owner types From/To/Boarding, show a live suggestion dropdown that tolerates
spelling mistakes and captures lat/long — active auto-correction, instead of the Phase-1 "type it
+ click Verify-on-map to eyeball it" (human detection).

**Options if/when built:** **Photon** (open-source, Apache 2.0, typo-tolerant, OSM data) via its
free public endpoint or self-hosted — the OSS-first, no-license-fee choice (§2.III); **Google
Places Autocomplete** — better India coverage but a **paid vendor** needing a §8 decision + cost
review. Both need network (offline falls back to free text).

**Why parked (2026-09-05, founder decision):** Phase 1's generated free Maps verify-link +
free-text capture is enough to validate entries and ships with zero dependency. Autocomplete is a
UX upgrade, not required yet.

**Priority: Low** — a UX nicety; the free verify-link already covers correctness.

**Trigger to build:** owners find typing+verify too error-prone in practice, or a feature needs
structured lat/long. Prefer Photon first (OSS); Google Places only with a constitution amendment
for the paid vendor.

**Related:** `purchase-trips.md` (route table); the hotel-discovery item below.

---

## Purchase-Trip: "Incoming Stock" offline support

**What:** The store-staff price-free Incoming Stock view (`/ops/:storeId/incoming`) reads directly
from the `incoming_stock` Supabase view (online-only). Cache it in Dexie so it also works offline
like the rest of the app.

**Why parked (2026-09-06):** it's a read-only convenience view for store staff; the whole
purchase-trip *authoring* flow is already offline-first. Not worth the sync plumbing (the view
spans org-derived rows, not a simple mirrored table) until offline store-staff use is a real need.

**Priority: Low** — a read-only convenience; the authoring flow that matters is already offline.

**Trigger to build:** store staff report needing the incoming list without connectivity.

**Related:** `purchase-trips.md` §10; `reference/schema.md` (`incoming_stock` view).

---

## Purchase-Trip: break-even / ROI forecast

**What:** In the trip *planning* phase, forecast the owner's return on investment — from a planned
budget + estimated expenses + expected margin + a sell-through assumption, project expected profit
and an estimated **break-even date** ("when does the money come back to my pocket"). Would live in
a `lib/tripForecast.ts` pure engine feeding the org-dashboard trip planning view.

**Why parked (2026-09-05, founder decision):** postponed to a later feature implementation. Also
honestly limited until then — a *real* break-even needs actual sales data (M5), so anything built
now is a projection from assumptions, clearly labeled as an estimate, not a guarantee.

**Priority: Low** — **gated on M5**: only becomes genuinely accurate once Billing/POS provides
real sell-through data; a pre-M5 build is an assumptions-only estimate.

**Trigger to build:** when Purchase-Trip planning is revisited for the forecast feature — and it
becomes genuinely accurate once M5 (Billing/POS) provides real sell-through data to replace the
assumed sell-through rate.

**Related:** `purchase-trips.md` (the module this attaches to); M5 seam for actuals.

---

## Purchase-Trip: hotel discovery & accommodation pricing

**What:** From the route's lat/long, suggest nearby hotels (rating, price tier, location) and/or
fill accommodation budget automatically.

**Why parked (2026-09-05, founder decision):** Google Places returns hotel name / rating /
location / a coarse `price_level` ($–$$$$) only — **not real ₹ nightly prices**. Real bookable
prices need a hotel-booking API (Booking.com / MakeMyTrip — separate, complex, partner-access,
paid), out of scope. For the *budget* the owner actually wants, the plan is **Claude/Haiku
estimates in Phase 2** (an estimate, clearly labeled), not Google.

**Priority: Low** — the **farthest out**: depends on the place-autocomplete item above *and* a paid
booking API, and the AI estimator covers the real budgeting need more cheaply.

**Trigger to build:** a real need for in-app hotel discovery, weighed against the booking-API
cost/complexity — and only after the Claude estimate proves insufficient.

**Related:** `purchase-trips.md` §3 (AI estimator, Phase 2); the Places item above.

---

# ✓ Superseded / done

## Store shelves / placement scheme (Direction + Row + Column) — SUPERSEDED

**Now an active spec:** pulled out of the backlog and broadened into **Floors + Sections + Zones +
Racks** placement — see [`stock-placement.md`](stock-placement.md) (Final v0.4.0, 2026-09-13). The
rest of this entry is kept only for history.

**What (original):** A per-store, optional (Settings-time) provision to define shelf/rack
locations — a flexible `code` string (with a Direction+Row+Column *builder* as the friendly
default, e.g. `E-03-02`) stored in a `store_shelves` table — so in-store stock placement becomes a
pick-from-list instead of free text.

**Related:** `stock-placement.md` (the spec it became).

---

<!-- Add new deferred items under the correct priority tier (Medium / Low), newest first within
     the tier, using the same What / Why parked / Priority / Trigger / Related shape. Keep the
     tiers ordered highest-first; move an item between tiers if its Priority line changes. -->
