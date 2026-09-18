# Warehouses (Stock Rooms — backyard / stockroom / godown) — storage spaces that hold stock outside the selling floor

**Version:** 1.0.0 · **Status:** **Built (Phases 1–3), 2026-09-18 — uncommitted, pending founder test.**
Schema/RLS live on prod; Dexie+sync wired; screens + mapping view + demo seeding implemented.
Phase 4 (stock movement) still deferred. Design below is the source of truth.
**Module:** Inventory (M3) prerequisite — build **before** the Inventory intake ("Ready for Inventory") work.
**Parent docs:** `../constitution.md` v1.15.0 (§6 central stock distribution, §2.IX models), `../reference/schema.md` (§3B `stock_locations`), `stock-placement.md` v1.0.0.

A **warehouse** (user-facing label: **"Stock Room"**) is any storage space that holds stock
**outside a store's selling floor** — a *backyard*, a back *stockroom*, an understairs nook, or a
full *godown*. It is a first-class storage entity that belongs to an **organization** and can be
**attached to one or more stores** (one warehouse → many stores). This is the concept the founder
described: because of place and per-sq-ft cost, real shops stash stock wherever space exists, and
that space must be nameable, placeable, and — later — the source of stock **distribution** to
stores.

This spec **supersedes** the earlier "godown-as-a-store" sketch (a warehouse is **not** a retail
outlet, so it gets its own table, not a flagged `stores` row) and **realises** the door
constitution §6 reserved: *"a godown/warehouse distributing stock… relax `store_id` / add an
org-level warehouse node."*

---

## 0. Why this exists (and why now, before Inventory intake)

- **Real constraint.** Indian cloth retailers rarely have all stock on the selling floor. A
  boutique keeps overflow in a backyard/understairs; a showroom has a stockroom; a chain or
  franchisor runs a central godown feeding several outlets. Inventory that can't say *"this SKU
  lives in the godown, not on the floor"* doesn't match reality.
- **It's the distribution backbone.** Chain (multi-store) and franchise distribution both mean
  "central stock point → stores" (constitution §6). The warehouse **is** that central point.
  Franchise adds a settlement on the transfer; chain does not — but the storage + transfer
  mechanism is identical. Building warehouses now puts that backbone in place.
- **Why before "Ready for Inventory" (M3 intake).** Inventory intake places each SKU onto a
  location. If a SKU can live in a warehouse (godown/backyard), intake must be able to pick a
  **warehouse** location from day one. Adding warehouses *after* intake ships means retrofitting
  the intake picker, the stock-level keying, and the sync order — rework §5's sequencing rule
  wants to avoid. So: **warehouses land as an M3 prerequisite, right after Stock Placement and
  before intake.**

---

## 1. Scope

**In scope (this spec):**
- A new **`warehouses`** table (org-owned; typed backyard/stockroom/godown/other).
- A new **`warehouse_stores`** link table (many-to-many: which stores a warehouse serves /
  is attached to).
- **Relaxing `stock_locations`** so a location tree belongs to **either** a store **or** a
  warehouse — reusing the *exact* Stock Placement tree (Floor › Section › Zone/Rack) inside a
  warehouse. No second location system.
- **Two create entry points** in the existing UI: from the org **Stores** page ("New stock room")
  and from the **Store edit** page (a "Stock Rooms" card).
- Warehouse **Stock Placement** (shelves/zones/racks inside a warehouse) via the existing card.
- A **Stock-room ↔ Store mapping view** (§3.5) — the read screen showing which warehouses serve
  which stores across the org.
- RLS, offline-first sync, permissions, and **three-org-type demo seeding with a "Seed stock
  rooms" facility and the mapping shown on each demo org page** (§6).

**Out of scope (deferred to their own specs / later phases):**
- **`stock_transfers`** (godown → store distribution movement) — still `franchise-settlement.md`
  §6 / constitution §6; a warehouse is a *source* for it, but the transfer flow itself is a
  separate build (see §9 plan, Phase 4 is explicitly *not* included here).
- Per-location **stock quantities / SKU links** — those live in the Inventory tables (built at
  intake; this spec only makes warehouse **locations** exist so intake can target them).
- A visual floor-map / planogram (the `stock_locations.layout` column stays reserved, unused).
- Warehouse-level costing/valuation, GST, or ownership-of-stock accounting (a franchise-settlement
  concern; noted as an open question, not built here).

---

## 2. The model (data)

### 2.1 `warehouses` — an org-owned storage space

```sql
create table warehouses (
  id                uuid primary key default gen_random_uuid(),  -- client-generated (offline-first)
  organization_id   uuid not null references organizations(id),  -- every warehouse lives under an org
  name              text not null,                                -- "Main Godown", "Backyard", "Understairs"
  warehouse_type    text not null default 'stockroom'
                      check (warehouse_type in ('backyard','stockroom','godown','other')),
  note              text,                                          -- optional free text
  sort_order        int  not null default 0,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
  -- + _localId / _dirty in Dexie (standard SyncMeta)
);
```

- **Org-owned, not store-owned.** A warehouse is created under an organization and can serve many
  stores (or none yet). This is what makes "one warehouse, many stores" and "each org has many
  warehouses" natural.
- `warehouse_type` is a **label/aid** (like `stock_locations.color`) — it does **not** change
  behaviour. backyard/understairs, stockroom, godown, other. UI shows a small badge.

### 2.2 `warehouse_stores` — the many-to-many attach

```sql
create table warehouse_stores (
  id                uuid primary key default gen_random_uuid(),
  warehouse_id      uuid not null references warehouses(id),
  store_id          uuid not null references stores(id),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);
-- Unique among non-deleted rows (a warehouse links a store at most once):
create unique index warehouse_stores_unique
  on warehouse_stores (warehouse_id, store_id) where deleted_at is null;
```

- **A central godown** → many `warehouse_stores` rows (the stores it supplies).
- **A store's own backyard** → exactly one row (that store).
- **An org-level warehouse not yet attached** → zero rows (still valid; org-wide, unattached).
- The link answers *"which stores draw stock from / physically sit near this warehouse"* — it
  drives the intake picker (which warehouse locations a store sees) and, later, default transfer
  routing.

> **Cardinality (confirmed):** a store may be attached to **multiple** warehouses (e.g. its own
> backyard **and** the org's central godown), and a warehouse may serve **multiple** stores. Both
> sides are many.

### 2.3 `stock_locations` — relaxed to belong to a store **or** a warehouse

The Stock Placement tree (`stock-placement.md`) is today **store-scoped**. Warehouses need the
**same** internal placement (shelves/zones/racks in a godown; a single flat "Backyard" zone in a
nook). Rather than build a second tree, we relax ownership:

```sql
alter table stock_locations alter column store_id drop not null;      -- was NOT NULL
alter table stock_locations add  column warehouse_id uuid references warehouses(id);
-- exactly one owner:
alter table stock_locations add constraint stock_locations_one_owner
  check ((store_id is not null) <> (warehouse_id is not null));
```

- **Everything else about the tree is unchanged**: `parent_id` self-reference, `placement_type`
  (`floor`,`section`,`zone`,`rack`), `code` (unique per `parent_id` group), the 8-direction rack
  builder, `color`, `sort_order`, soft-delete + cascade, the reserved `layout` jsonb.
- **`code` uniqueness** widens naturally: it is per *sibling group* (`parent_id`), and top-level
  siblings are scoped by their owner — a warehouse's top-level `E-01-01` and a store's top-level
  `E-01-01` don't collide because they hang off different owners. (Implementation note: the
  existing per-`(store_id,parent_id)` uniqueness becomes per-`(owner,parent_id)`; see §9 Phase 1.)
- **No new `placement_type`.** The founder's "shelves/zones" inside a warehouse map to the existing
  types: a **shelf = `rack`** (coordinate code `A-01-03` via the Direction+Row+Col builder), a
  free display/area = `zone`, containers = `floor`/`section`. A small backyard is just **one flat
  `zone`** ("Backyard"). A big godown is `Floor › Section › racks (shelves)`. (UI *may* relabel
  "Rack" → "Shelf/Rack" in warehouse context — cosmetic only, same type.)

### 2.4 Relationship map

```
organization
  ├─ stores (retail outlets, existing)
  │     └─ stock_locations (store_id set)         ← selling-floor placement (existing)
  └─ warehouses (NEW: backyard/stockroom/godown)
        ├─ warehouse_stores → stores (NEW: many-to-many attach)
        └─ stock_locations (warehouse_id set)     ← warehouse shelves/zones/racks (reused tree)
```

---

## 3. Screens (two entry points, one underlying table)

Both entry points create the **same** `warehouses` row; they differ only in the initial
`warehouse_stores` link.

### 3.1 Org **Stores** page — "New stock room" (org-level)

**Where:** `src/features/stores/pages/StoresListPage.tsx` — the `/org/:orgId/stores` page that
today shows a single **"New store"** action in its `PageHeading`.

**Change:** add a sibling **"New stock room"** action in the same header, and a **second section**
below the stores grid listing the org's stock rooms (name + `warehouse_type` badge + "Edit"),
mirroring the stores grid. Archived stock rooms fold under the existing "Show archived" pattern.

```
Stores                                   [New stock room] [New store]
  ── Stores grid (existing) ──
  ── Stock rooms grid (new) ──   e.g.  "Main Godown"  [godown]   Edit
                                       "Shared Backyard" [backyard] Edit
```

- **Create form** (`/org/:orgId/stock-rooms/new`, mirroring `StoreCreatePage.tsx`): name, type,
  and an **optional multi-select of stores** to attach (writes `warehouse_stores` rows). Org-level
  warehouses (central godown) typically attach several stores here.
- **Edit page** (`/org/:orgId/stock-rooms/:warehouseId/edit`, mirroring `StoreEditPage.tsx`):
  details card + **attached-stores editor** + the **Stock Placement card** (§3.3) + a danger zone
  (archive/soft-delete).

### 3.2 Store **edit** page — "Stock Rooms" card (store-level backyard)

**Where:** `src/features/stores/pages/StoreEditPage.tsx` — already hosts the **Stock Placement**
card (before Members). Section order becomes:

```
Store → Store details → Stock Placement → Stock Rooms (NEW) → Members → Danger zone
```

**Change:** a new **self-managing "Stock Rooms" card** (like the Members card — each add/edit/
delete writes through immediately, not via the profile "Save" button). It:
- **Lists** the warehouses attached to **this** store (via `warehouse_stores`), showing type badge.
- **"+ Add stock room"** creates a `warehouses` row **and** auto-links it to this store (one
  `warehouse_stores` row) — for a store's own backyard/understairs/non-display space.
- Each row links to the warehouse edit page (§3.1) where its internal placement is defined.
- Optionally, **"Attach existing"** to link an already-created org warehouse to this store.

### 3.3 Warehouse **Stock Placement** card — shelves / zones / racks (reused)

The **existing** `src/features/inventory/placement/StockPlacementCard.tsx` is reused on the
warehouse edit page, passing `warehouse_id` instead of `store_id`. All actions are inherited
unchanged: Add floor / section / zone / rack, the **bulk rack grid** (very useful for godown
shelving — "Direction E, Rows 1–3, Cols 1–4" → `E-01-01…E-03-04`), hand-edited codes, colours,
drag-reorder, cascade-delete-with-counts. A small backyard defines one flat `zone`; a big godown
defines the full tree.

### 3.4 Placement **Picker** (intake consumer — read side)

The reusable Placement Picker (`stock-placement.md` §Placement Picker) — used by Inventory intake
— must, for a given store, list that store's **own** leaf locations **plus** the leaf locations of
**every warehouse attached to it** (via `warehouse_stores`), each shown with its owner + parent
path so `E-03-02` in the store vs in the godown is unambiguous (e.g. *"Godown › A › E-03-02"* vs
*"Ground › Lee › E-03-02"*). This is what lets intake shelve a received SKU into the godown, not
just the floor. (Picker read is `inventory.read`; see §5.)

### 3.5 **Stock-room ↔ Store mapping view** (the "what's attached to what" screen)

A dedicated read view that answers *"which stock rooms serve which stores, across this
organization"* at a glance — the founder's "show the stock rooms mapped with stores/
organizations" requirement. It is the org-level map of every `warehouse_stores` link.

**Where:** on the org **Stores** page (§3.1), below the two grids, as a **"Stock room map"**
panel (a collapsible section, like the archived-stores toggle already there); and mirrored in the
**demo** admin so a reviewer/investor sees the mapping per demo org (§6).

**What it shows:** for each warehouse in the org — its name + `warehouse_type` badge + the list of
stores it is attached to (chips); and, read the other way, an optional per-store rollup
("Kadapa draws from: Central Godown, its own Backyard"). Unattached org-level warehouses show as
"org-wide — not yet attached to a store." Rendered from Dexie (offline-capable), owner/manager
read only.

```
Stock room map
  Central Godown   [godown]     -> Proddatur, Kadapa, New Branch     (org-level, 3 stores)
  Shared Backyard  [backyard]   -> Proddatur                         (1 store)
  Transit hold     [other]      -> org-wide, not yet attached
```

This view is **read-only** (attachments are edited on the warehouse edit page §3.1, or created via
the store card §3.2); it exists purely to make the one-warehouse-many-stores relationship visible.

---

## 4. Offline-first & sync

Standard write-through path (constitution §2.I), same as `stock_locations`:

- **New Dexie tables:** `warehouses`, `warehouse_stores` (SyncMeta: `_localId`/`_dirty`/
  `last_modified_at`/`deleted_at`; client-generated `id`). Bump the Dexie schema version.
- **PUSH_ORDER:** insert `warehouses` **before** `warehouse_stores` and **before** any
  `stock_locations` row carrying a `warehouse_id` (a location's owner must exist first) — the same
  parent-before-child ordering the engine already does for trip→invoice→item and
  parent→child placements. `warehouse_stores` also depends on `stores` (already earlier in order).
- **Pull set:** add both tables. The **Picker must read from Dexie** (intake works offline), so
  warehouse locations and links must be present locally.

---

## 5. Roles & permissions

A warehouse is **org-level configuration** (like creating/editing a store), so:

- **Design a warehouse** — create/edit/delete a `warehouses` row, manage its `warehouse_stores`
  attachments, and design its internal placement — is gated to **`org_owner` / `org_manager`** via
  the **`store.create`/`store.edit`** capability family (the same access that governs the store
  create/edit pages these entry points live on). Store sales/temp staff cannot design warehouses.
  - Consequence: designing a **store-level** stock room from the Store edit card is inherently
    owner/manager-only too (that card sits on the owner/manager store-edit page).
- **Read / pick warehouse locations** — rendering the Picker so intake can place a SKU into a
  warehouse — is open to inventory staff via **`inventory.read`** (the same read that already
  exposes store placements). They pick from existing warehouse locations; they cannot create them.

**RLS (dual-scope — the one real complication):**
- `warehouses` / `warehouse_stores` are **org-scoped** → `has_org_permission()` on
  `organization_id` (the org-scoped helper already used by org tables).
- `stock_locations` becomes **dual-scoped**: a row with `store_id` keeps the existing
  **store-scoped** policy (`has_store_permission()`); a row with `warehouse_id` uses the
  **org-scoped** policy against the warehouse's `organization_id`. The `stock_locations_one_owner`
  check guarantees exactly one branch applies. This is a deliberate widening of the "first
  store-scoped table" pattern noted in `stock-placement.md` — documented here so the RLS is written
  as one policy with two owner branches, not two conflicting policies.
- **Hard delete** stays platform-admin-only; `hard_delete_organization` must also purge
  `warehouses`, `warehouse_stores`, and warehouse-owned `stock_locations`.

---

## 6. Demo data (three org types) — creation facility + mapping display

Stock rooms are a **first-class part of demo-organization creation**, exactly like Stock Placement
and Purchase Trips already are. Each of the three demo org types (`independent` / `chain` /
`franchise`) can seed its stock rooms, and each demo page **shows the stock-room ↔ store mapping**
so a reviewer/investor sees the relationship without leaving the demo console.

**Wiring (mirrors the existing Stock Placement demo integration):**
- **A new `StockRoomsSection`** component in the demo admin (mirroring
  `components/PurchaseTripsSection.tsx` / the placement demo section), added to each of the three
  demo pages `src/features/admin/demo/demo.{independent,chain,franchise}.tsx`. It offers a
  **"Seed stock rooms"** action and a summary of what was created (warehouses + their store
  attachments + a placement count).
- **A `warehouses.demo.ts`** seeder (mirroring `demoPlacement.ts` / `purchaseTrips.demo.ts`) that
  writes through the **normal offline-first path** (Dexie + outbox) — so demo warehouses,
  `warehouse_stores` links, and warehouse-owned `stock_locations` behave like real data.
- **Mapping display in the demo cards:** each demo store card gets a line showing the stock rooms
  attached to that store (reusing/echoing the `StorePlacementLine` pattern —
  `components/StorePlacementLine.tsx`), and each demo org page renders the **Stock-room ↔ Store
  mapping view** (§3.5) so the whole org's warehouse→store map is visible in one place.

The seed spreads a distinct warehouse shape across the three org types to exercise every case:

| Org type | Warehouse scenario | Demonstrates |
|---|---|---|
| **Independent** — *Vasavi Cloth Store* | One **store-level "Backyard"** (`backyard`) attached to the single store; a flat `zone` "Understairs" + 2 racks | store's own non-display space, flat placement, 1-to-1 mapping |
| **Chain** — *Sri Lakshmi Textiles* | One **org-level "Central Godown"** (`godown`) attached to **all** stores; full Floor > Section > shelves tree with a **bulk rack grid** + one store also having its **own backyard** | **one warehouse -> many stores** (hub-and-spoke) **and** a store with two stock rooms — the richest mapping |
| **Franchise** — *Bandrip streetwear* | A **franchisor-side "Bandrip Godown"** (`godown`) attached to the franchise stores (the source for future goods-received + settlement) | franchise central stock source; many-store mapping; ties to `stock_transfers`/settlement later |

Together these cover: store-level backyard · org-level central godown · one-warehouse-many-stores ·
a store attached to multiple warehouses · an unattached org-level warehouse (add a "Transit hold"
with no links to show the "org-wide, not yet attached" state) — i.e. the full mapping matrix a
reviewer would want to see, per org type.

Reset parity: add `warehouses`, `warehouse_stores`, and warehouse-owned `stock_locations` to
`hard_delete_organization` and the demo reset so a demo org deletes traceless (same treatment
Purchase-Trip and Stock Placement rows got).

---

## 7. What this does **not** change (launch safety)

- **`stores`** table — untouched (warehouse is **not** a flagged store). No `store_type` column.
- **`store_business_model` view** — untouched; warehouses never count as stores, so a godown can't
  accidentally make an org look like a "chain". (This is the clean advantage over godown-as-store.)
- **Existing Stock Placement code** (`placement.ts`, `buildTree`, the card) — logic is
  owner-agnostic; only the owning-id it's handed changes (`store_id` → `warehouse_id`). No change
  to tree/cascade/code-generation logic.
- **Purchase-Trip, Deliveries, Franchise settlement** — untouched. (A warehouse becomes a
  *destination* for received goods later, but that wiring is intake/transfer work, not this spec.)

---

## 8. Open questions (resolve before/while building)

1. **Stock ownership in an org-level warehouse** — when stock sits in a central godown, whose is
   it, and when is landed cost booked (at godown receipt, or at transfer to store)? Matters for
   chain vs franchise valuation and for the future settlement. *(Deferred to the transfer/intake
   spec; warehouses-as-locations don't need it resolved to ship.)*
2. ✅ **Resolved (2026-09-18):** DB/code name is **`warehouses`** (future-proof); UI shows
   **"Stock Room"**. (Founder confirmed the recommendation.)
3. ✅ **Resolved (2026-09-18):** the store card ships **create-and-auto-link only** in v1;
   **"Attach existing"** is a **fast-follow**, not in the first build. (Founder confirmed.)
4. ✅ **Resolved (2026-09-18):** keep **"Rack"** everywhere — no "Shelf" relabel in warehouse
   context. (Founder confirmed; revisit only if asked.)
5. **`warehouse_type` set** — is `backyard/stockroom/godown/other` complete, or add e.g.
   `transit`/`cold-storage`? *(Cloth retail: current set is enough.)*

---

## 9. Development plan (phased — build order, no code yet)

> **Money/tax note:** warehouses carry **no** money/tax/barcode fields, so the worldwide-ready
> money rules (`stock-placement.md` §Module-family principles) don't bind these tables. Placement
> reuse inherits whatever those tables already do.

**Phase 0 — Spec sign-off (this doc).** Founder confirms §8 open questions 2–4 (naming, attach-
existing, relabel). No migration until signed off (constitution §9).

**Phase 1 — Schema + RLS + types (migrations).**
- Migration A: create `warehouses` + `warehouse_stores` (indexes, org-scoped RLS via
  `has_org_permission`).
- Migration B: relax `stock_locations` — drop `store_id NOT NULL`, add `warehouse_id`, add
  `stock_locations_one_owner` check, widen the sibling-`code` uniqueness to be per-owner, and
  add the **dual-scope** RLS branch for warehouse-owned rows.
- Migration C: extend `hard_delete_organization` to purge the three surfaces.
- Regenerate TS types; update `schema.md` §3B (+ forward-pointer cleanup) and `schema.mmd`.
- **Tests:** RLS — an org member with `store.edit` can design a warehouse in their org and not in
  another; inventory staff can *read* but not design; a warehouse-owned `stock_location` obeys the
  org branch, a store-owned one the store branch; the one-owner check rejects both/neither.

**Phase 2 — Dexie + sync.**
- Add `warehouses`/`warehouse_stores` Dexie stores (schema-version bump); add to `PUSH_ORDER`
  (warehouses → links → warehouse-owned locations) and the pull set.
- **Tests:** create a warehouse + a warehouse location offline → reconnect → both land on Supabase
  in the right order (constitution §7 DoD); soft-delete propagates.

**Phase 3 — Screens (read/write UI).**
- Org **Stores** page: "New stock room" action + stock-rooms grid + create/edit pages
  (mirroring store create/edit). Attached-stores multi-select.
- Store **edit** page: "Stock Rooms" card (create-and-auto-link; list attached).
- Warehouse **edit** page: reuse `StockPlacementCard` with `warehouse_id`.
- **Mapping view (§3.5):** the "Stock room map" panel on the org Stores page (read-only, from
  Dexie) showing every warehouse → its attached stores.
- **Picker (read):** extend to include attached-warehouse leaf locations with owner+path labels
  (this is the piece intake consumes).
- **Demo (§6):** a `StockRoomsSection` + "Seed stock rooms" action on all three demo pages, a
  `warehouses.demo.ts` seeder (offline write-through), the per-store stock-room line in demo
  cards, and the mapping view rendered per demo org; extend `hard_delete_organization` + demo
  reset for the three tables.
- **Tests/verify:** create a godown from the org page, attach 2 stores, add a bulk rack grid,
  confirm the picker for those stores now lists the godown shelves and the mapping view shows the
  two links (offline). Seed each demo org type and confirm its mapping renders. Screenshot proof.

**Phase 4 — (explicitly deferred, NOT in this spec) stock movement.**
- `stock_transfers` (godown → store), goods-received-from-franchisor, and per-location stock
  quantities are built with Inventory intake / the transfer spec. Warehouses (Phases 1–3) are the
  prerequisite that makes those honest.

**Sequencing:** Phases 1–3 are the "warehouse facility" the founder wants **before "Ready for
Inventory."** They slot in as an **M3 prerequisite immediately after Stock Placement**, the same
way Stock Placement itself was a prerequisite — small, self-contained, offline-first, and required
so intake can target warehouse locations without later rework.

---

## 10. Locked decisions

1. **Warehouse is its own table** (`warehouses`), **not** a flagged `stores` row — a warehouse is
   not a retail outlet. (Supersedes the earlier "godown-as-store" sketch.)
2. **Org-owned**, attachable to **many stores** (`warehouse_stores`, many-to-many); a store may
   have many warehouses; a warehouse may serve many stores.
3. **Types:** `backyard`, `stockroom`, `godown`, `other` — a label/aid, not behaviour.
4. **One location tree reused** — `stock_locations` relaxed to `store_id` **xor** `warehouse_id`;
   no second placement system, no new `placement_type` (shelf = `rack`).
5. **Two entry points** — org Stores page ("New stock room", org-level) and Store edit page
   ("Stock Rooms" card, auto-linked to that store). Same underlying table.
6. **Permissions** — design = owner/manager (`store.create`/`store.edit`); read/pick =
   inventory staff (`inventory.read`). `stock_locations` RLS becomes dual-scope (store vs
   warehouse owner branch).
7. **Build before Inventory intake** — Phases 1–3 are an M3 prerequisite; stock movement
   (`stock_transfers`) stays deferred to the transfer/intake spec (Phase 4, not built here).
8. **Demo is a creation facility, not an afterthought** — each demo org type (individual/chain/
   franchise) can **seed stock rooms**, and every demo org page **shows the stock-room ↔ store
   mapping** (§3.5, §6), same first-class demo integration Stock Placement and Purchase Trips got.

---

*Companion to `stock-placement.md` (the location tree this reuses) and `franchise-settlement.md`
(the settlement a franchise transfer will later attach to a warehouse→store movement).*
