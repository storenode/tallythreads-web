# Stock Placement (Floors, Sections, Zones & Racks) — store-level location system

**Version:** 1.0.0 · **Status:** **Built & live** (2026-09-13) — offline-first `stock_locations`
tree + store-edit card + optional palette colours + demo seeding. Migrations
`20260913141236` / `20260913191215` / `20260914002325`. · **Module:** Inventory (M3), first table

The store-level system that names **where** stock physically sits — so a SKU, when it enters
inventory, can be placed on a known location, and staff can find it again. This is the first
piece of the Inventory module family and a **hard prerequisite** for inventory intake (intake
places each SKU onto a location defined here).

## Why this exists

Inventory intake needs a **placement target** for every SKU ("this cap goes to *The bandits*
wall / this Lee jean goes to rack *E-03-02*"). Different stores organise their floor completely
differently, so we cannot hardcode one layout:

- **Bandrip (test store)** is a small streetwear boutique — everything is **hung** on wall
  rails, rolling racks, and a grid panel (caps/sunglasses). No shelves, no folded stock. Staff
  locate goods by **zone** ("The bandits", "Jackets rail"), not by a coordinate.
- **Medium/large showrooms** (our actual target market, incl. worldwide) organise the shop into
  **brand/area sections** (a "Lee" section, a "Levi's" section) — often across multiple
  **floors** — each section holding its own **racks** (folded stock, located by a coordinate
  code) and **zones** (hanging display). This is the global "aisle → bin location" pattern.

So the product must support the small flat boutique **and** the multi-floor, sectioned showroom
— without becoming several systems to maintain.

## The model: one location tree, four node types

Everything is a row in **one** table, `stock_locations`. A row's `placement_type` says what it
is; a `parent_id` says what it sits inside. That gives a flexible **hierarchy** with **zero**
extra tables:

```
Floor  ─▶ Section ─▶ Rack   (folded stock; Direction+Row+Column → code)
                  └▶ Zone   (hanging / free-named display area)
```

| Type | Role | Example `code` | Created how |
|---|---|---|---|
| **floor** | container | `Ground`, `First` | type a name |
| **section** | container (brand/area) | `Lee`, `Levi's` | type a name |
| **zone** | **leaf** placement (boutique way) | `The bandits` | type a name |
| **rack** | **leaf** placement (warehouse way) | `E-03-02` | **Direction + Row + Column** |

**Every level is optional and independent** — the tree adapts to each store:
- **Bandrip:** no floors, no sections — just a **flat list of zones** (`parent_id` all null). The
  tree collapses to a flat list. Nothing forced.
- **Big showroom:** `Ground › Lee › {rack E-03-02, zone "Lee wall"}`, `First › Levi's › …`.

**Crucially, floor/section are just *container* rows and zone/rack are just *leaf* rows in the
same table.** Everything downstream (inventory intake, POS "where is this?", future transfers)
still sees only *a location + its code* (plus its parent path for display). → **One table, one
picker, one tree.** Supporting the whole range does **not** add systems to maintain.

Worldwide-ready as-is: this Floor→Section→Rack/Zone tree is exactly how warehouse systems in
India, the US and the EU model locations. Placement is *not* a globalisation risk (money/tax is —
see the module-family principles).

## Data model

New table `stock_locations`, **store-scoped**, offline-first (standard SyncMeta:
`_localId`/`_dirty`/`last_modified_at`/`deleted_at`; client-generated `id`).

```
stock_locations
  id             uuid  PK   (client-generated, like every purchase_* row)
  store_id       uuid  FK → stores.id            -- placement is per store (each store, own layout)
  parent_id      uuid  NULL FK → stock_locations.id  -- container it sits under (same store); null = top level
  placement_type text  CHECK ('floor','section','zone','rack')
  code           text  NOT NULL                  -- "Ground" | "Lee" | "The bandits" | "E-03-02"
  label          text  NULL                      -- optional human name / description
  -- rack builder inputs (NULL unless placement_type='rack'):
  direction      text  NULL CHECK (direction IN ('N','S','E','W','NE','NW','SE','SW'))
  rack_row       text  NULL                      -- '01'..'99' (2-digit, zero-padded, numeric)
  rack_col       text  NULL                      -- '01'..'99'
  layout         jsonb NULL                      -- RESERVED for a future visual planogram
                                                 --   (shape/x/y/w/h). UNUSED at launch, no UI. See below.
  color          text  NULL CHECK (color IN ('red','amber','green','teal','blue','violet','pink','slate'))
                                                 -- optional palette colour (aid; code always shown)
  sort_order     int   NOT NULL DEFAULT 0        -- manual ordering among siblings
  last_modified_at, deleted_at                   -- + _localId/_dirty in Dexie
```

**Hierarchy rules**
- `parent_id` must point to a location in the **same store**.
- **Containers** = `floor`, `section`. **Leaves** = `zone`, `rack`.
- Intended nesting is `floor › section › (zone|rack)`, but **any level may be skipped**: a rack
  or zone may be top-level (`parent_id` null), a section may sit directly at top level with no
  floor, etc. The DB keeps `parent_id` a plain nullable FK (flexible); the **UI/builder** guides
  the sensible shape rather than the schema hard-enforcing every rule.
- The **human-readable full address** is the ancestor codes + own code — e.g.
  `Ground › Lee › E-03-02`. Rendered by walking `parent_id`.

**Code / builder rules**
- `code` is **unique among siblings** (same `store_id` + same `parent_id`), **case-insensitive**,
  among non-deleted rows. So `Lee › E-03-02` and `Levi's › E-03-02` can coexist, but one section
  can't have two `E-03-02`, nor "The Bandits" beside "the bandits".
- **Direction** — a fixed set of **8**: `N, S, E, W, NE, NW, SE, SW`.
- **Row / Column** — **numbers only**, 2-digit zero-padded text (`01`, `02`) so they sort/render
  consistently (text keeps leading zeros and matches the code).
- **Rack rows:** `direction`, `rack_row`, `rack_col` required; `code` **generated** as
  `{direction}-{rack_row}-{rack_col}` → `E-03-02`.
  - **Editable code:** after generation the `code` is **hand-editable** for odd spots (a hanging
    rod, the counter). `code` is the **source of truth**; the three rack inputs are kept only as
    *provenance* and may legitimately no longer match a hand-edited code.
- **Floor / Section / Zone rows:** `code` = the typed name; the three rack columns stay NULL.
- **Soft-delete only** (constitution §6): stamp `deleted_at`, keep the row. Deleting a **non-empty
  container** (floor/section) **cascades** the soft-delete to **all its descendants** (its
  sections, racks, zones) — but **only after an explicit confirmation** that **names what will
  go**, e.g. *"Delete 'Lee'? This also removes everything inside it — 2 racks and 1 zone."* Each
  affected row is stamped `deleted_at` (one write-through per row, so sync propagates every
  delete). No hard delete.
- Placement is **optional / non-blocking**: a store can run with **zero** locations; a SKU simply
  has no placement.

`rack_row`/`rack_col` use the `_row`/`_col` suffix because `row`/`column` are SQL reserved words.

### The reserved `layout` column (position / shape) — deliberately deferred

The founder wants to eventually see the store as a **visual floor-plan** (a section as a
square/rectangle, racks as grid cells). That **visual planogram is a heavy Phase-2 feature**
(canvas editor, coordinate system, rendering) and is **out of scope for launch** — building it
now would delay the year-end Bandrip launch, and its geometry model is guesswork without the UI.

**What matters for finding stock is the *hierarchy*, not pixel geometry** — and the `row × column`
grid already represents a section's rectangle of racks *logically*. So at launch we ship the
hierarchy and **reserve** a nullable `layout jsonb` to hold future geometry
(`{shape, x, y, w, h}`) per location. It stays **null and unused now**, so when the visual
floor-map is built later it's a **no-migration** addition. This is the deliberate middle path:
*open the door, don't build the room yet.*

### Location colours (built)

Each location may carry an optional **`color`** — a **constrained palette token** (`red, amber,
green, teal, blue, violet, pink, slate`), **not** hex, so it stays legible in light/dark and maps
to buyable colored shelf labels. **Colour is an aid, never the identifier** — the code is always
shown alongside (colourblind staff; B/W thermal labels can't print colour, so the physical
colored *sticker* carries it there). A reusable **`LocationChip`** (code + colour) is the token
reused across the placement tree, the demo store card, and (future) the inventory picker/labels;
a swatch **`ColorPicker`** sets it in the store-edit card and the demo editor. Colour was
deliberately given its **own column** (not the reserved `layout` jsonb) since it's a first-class
displayed attribute now. Demo templates pre-assign brand colours. Migration
`20260914002325_stock_locations_color.sql`.

## Screens

### Placement Manager — the store **Edit** page
Where a store's owner/manager **defines** its locations. It lives as a **new "Stock Placement"
card on the store edit page** (`src/features/stores/pages/StoreEditPage.tsx`), inserted **after
the "Store details" card and before the "Members" card** (between `StoreEditPage.tsx` ~L404 and
the `<StoreMembersCard>` at ~L406). Section order becomes:
**Store → Store details → Stock Placement (new) → Members → Danger zone.**

Like the Members card (and unlike Store/Store details), it is a **self-managing card**: each
location is added / edited / soft-deleted **immediately** through its own write-through
(Dexie + outbox), **not** saved via the store-profile form's single "Save changes" button. So it
sits **outside** that form, as its own card.

It renders the store's locations as a **collapsible tree** (`Floor › Section › Rack/Zone`,
ordered by `sort_order`), e.g.:

```
Ground  (floor)
  Lee  (section)
     Racks:  E-03-02, E-03-03
     Zone:   Lee hanging wall
  Levi's  (section)
     Racks:  W-01-01 …
The bandits  (zone, top-level — no floor/section)
```

Actions (each optionally under a selected parent):
- **Add floor** / **Add section** — a name field → a container row.
- **Add zone** — a name field ("Zone name", e.g. *Jackets rail*) → a `zone` leaf.
- **Add rack** — the **Direction + Row + Column** builder (8-direction picker + two numeric
  fields). **Bulk mode:** "Direction E, Rows 1–3, Columns 1–4" generates the full grid of `code`s
  (`E-01-01 … E-03-04`) under the chosen section in one action.
- Edit (incl. hand-editing a generated rack code); soft-delete; drag to reorder (`sort_order`).
  Deleting a **non-empty** floor/section opens a **confirmation dialog** that states the cascade
  and the counts (*"…also removes 2 racks and 1 zone"*) before anything is deleted.

For a store like Bandrip that defines only flat zones, the tree simply shows a flat list — the
hierarchy never gets in the way.

### Placement Picker — reusable component
The single component reused wherever "choose a location" is needed (inventory intake first;
later transfers, POS lookup). Given a `store_id`, it lists that store's **leaf** locations
(zone/rack), searchable by `code`/`label`, **showing the full parent path** (`Lee › E-03-02`) so
the same short code under different sections is unambiguous. Returns the chosen `stock_locations`
row(s). Because a SKU may sit in **multiple** locations (below), the picker supports
**multi-select** where the caller needs it (intake). Build **once**, reuse everywhere.

**Inline quick-add (owner/manager only):** for a user who **can design placements**
(owner/manager), the picker offers a **"+ New location"** action to create a zone/rack **on the
spot during intake** without leaving for Settings. Sales/temp staff doing intake **pick from
existing** locations only — if a new location is needed, an owner/manager adds it. (Same builder
logic as the Manager; wired when intake is built.)

## Multiple locations per SKU (confirmed)

A single SKU may be placed in **more than one** location — e.g. the same T-shirt hangs on
*Jackets rail* and also sits folded in `Lee › E-03-02`. Implications:

- The **SKU ↔ location** relationship is **many-to-many**, and **stock quantity is tracked per
  `(SKU, location)`**; a SKU's total on-hand = the sum across its locations.
- That link + per-location quantity lives in the **inventory tables** (e.g. a `stock_levels` row
  keyed by `(variant, location)`), **not** in `stock_locations` — this table stays a pure list of
  locations. Recorded here so the Inventory-intake spec designs the link as many-to-many from the
  start (intake can split a received quantity across several locations).

## Roles & permissions

Placement is **store design/configuration**, so **defining** it is restricted to the org
**owner/manager** — the roles that create and edit stores — while **reading** it (to place a SKU
during intake) is open to inventory staff. (Founder decision, 2026-09-13.)

- **Design placements** — create / edit / delete (incl. cascade-delete) in the Placement Manager
  **and** the Picker's inline quick-add — gated to **`org_owner` / `org_manager`** via the
  **`store.create`** capability (the create-&-edit-store ability these roles hold,
  `roles-and-permissions.md` §3). This is the same access that governs the store edit page the
  card lives on. **Store sales/temp staff cannot design placements.**
- **Read / pick placements** — rendering the Picker list to choose a location during intake — is
  available to inventory staff via **`inventory.read`** (`org_owner`, `org_manager`,
  `store_sales_staff`, `store_temp_staff`). They choose from **existing** locations; they cannot
  create or edit them.
- Because design is owner/manager-only, **cascade-deleting** a floor/section is inherently
  owner/manager-only; the confirmation-with-counts dialog is an extra guard on top.

## Offline-first & sync

Same write-through path as every other module (constitution §2.I): a new `stock_locations` Dexie
table + outbox entries, drained by the existing sync engine. The **picker must read from Dexie**
so intake works offline. Add `stock_locations` to the sync `PUSH_ORDER` (it depends only on
`stores` + itself via `parent_id`, so a parent must push before its children — same dependency
ordering the engine already does for trip→invoice→item) and to the pull set. RLS mirrors the
store-scoped tables (access via the member's store membership, gated by
`inventory.write`/`inventory.read`).

**Build note:** this is the **first store-scoped** module table (the `purchase_*` tables are
org/trip-scoped), so its RLS establishes the store-scoped pattern — a member may act on a
`stock_locations` row when they hold a membership on its `store_id` **or** org-level access to
the store's organization, with the permission check on top. Reuse this pattern for the coming
inventory tables.

## Demo data (three org types)

TallyThreads' demo has **three organization setups** (`organizations.registration_type` =
`independent` | `chain` | `franchise`), each with its own admin page + seeder in
`src/features/admin/demo/` (`demo.independent.tsx` / `demo.chain.tsx` / `demo.franchise.tsx`).
Stock Placement plugs into that exactly like Purchase Trips already does:

- **A new `StockPlacementSection`** in the demo admin (mirroring
  `components/PurchaseTripsSection.tsx`) on each of the three demo pages — a "Seed stock
  placement" action + a summary of what was created per store.
- **A `stockPlacement.demo.ts`** seeder (mirroring `purchaseTrips.demo.ts` /
  `seedDemoPurchaseTrips`) that writes through the **normal offline-first path** (Dexie +
  outbox), so demo data behaves like real data.
- **Reset/delete parity:** add `stock_locations` to `hard_delete_organization` (the same purge
  that was extended for Purchase-Trip rows) and to the demo reset script, so a demo org deletes
  traceless.

The seed spreads scenarios across the three org types' stores to exercise **every** placement
shape:

| Org type | Store | Placement scenario | Features demonstrated |
|---|---|---|---|
| **Independent** — *Vasavi Cloth Store* | Vasavi (single) | Sections **Sarees / Dress Material / Readymade**; Sarees = bulk rack grid `E-01-01…E-02-04`, Dress Material = `W-01-01…W-01-03`, Readymade = a zone + 2 racks | sections, **bulk rack grid**, mixed rack+zone (traditional folded-stock shop) |
| **Chain** — *Sri Lakshmi Textiles* | — Proddatur (flagship) | **Multi-floor**: Ground › {Men's, Women's}, First › {Kids, Home Furnishing}; each section a few racks + one zone | **floors + sections + depth**, mixed |
| | — Kadapa | **Flat racks** at top level (no sections) + one zone | flat racks, **top-level leaves** |
| | — New Branch | **No placements** | **empty state / optional** |
| **Franchise** — *Bandrip streetwear* | — Kadapa | **Flat zones**: "The bandits", "Jackets rail", "Sunglasses grid" | boutique **zones-only**, top-level leaves (Bandrip's real way) |
| | — Nellore | Brand sections **Lee** (rack `E-03-02` + zone "Lee hanging wall") and **Levi's** (racks) | **brand section with mixed rack+zone** (the founder's Lee example) |
| | — Tirupati | One zone + racks with **hand-edited odd codes** ("COUNTER", "HANG-ROD") | **editable generated code** for odd spots |
| | — Anantapur | **No placements** | empty state (a second empty, boutique) |

Together these cover: flat zones · flat racks · sections · multi-floor hierarchy · bulk grid ·
mixed rack+zone · top-level leaves · hand-edited codes · empty (optional) stores — i.e. the full
matrix a reviewer or investor would want to see, per org type.

## Relationship to the rest of Inventory

- **Consumer:** Inventory **intake** (the parked M3 flow) calls the Placement Picker to attach
  one or more `stock_locations` to each SKU it shelves; the link + per-location quantity live in
  the inventory tables.
- **Deferred godown / distribution:** the parked "quantity-vs-store allocation" and godown flow
  reuse the **same location tree** ("a godown is just a location") — per the founder's "no
  difference by store type" decision. When built, they extend this table (e.g. relax `store_id` /
  add an org-level warehouse node), not a second concept. Not designed in detail here; noted so
  the table stays compatible.

## Module-family principles: worldwide-ready (carry into the Inventory tables)

Placement itself has **no money/tax/barcode fields**, so these don't bind `stock_locations` — but
this is the first Inventory-family spec, so the founder's **worldwide-ready** decisions are
recorded here to bind the *upcoming* inventory tables (products / variants / stock / pricing):

1. **Generic money** — new tables use **minor units (integer) + a currency code** (currency at
   org/store level), never a currency-baked name like `paise`. (Existing Purchase-Trip `paise`
   columns are **not** changed now — India-first; only *new* tables follow this.)
2. **Pluggable tax** — do **not** hardcode GST/HSN. Store an optional generic `tax_code` and
   treat tax as a plugin (same pattern as the Purchase-Trip margin plugin), so US sales tax / EU
   VAT can slot in later. India (GST/HSN) is the first implementation.
3. **Barcode = value + symbology** — the SKU barcode field stores the **value and its type**
   (Code128 for our own labels; also accept **UPC/EAN** on branded goods common in US retail).

Guiding rule: **global-ready model, India-first launch.** Shape the data model so worldwide is an
evolution, not a rewrite — but do **not** build multi-currency / multi-tax engines now, and do
not let worldwide ambition delay the year-end Bandrip launch.

## Locked decisions

1. **Mixing** zone + rack in one store — **yes.**
2. **Direction set** — the full **8**: `N, S, E, W, NE, NW, SE, SW`.
3. **Row/Column format** — **numbers only**, 2-digit zero-padded (`01`, `02`).
4. **Editable generated code** — **yes**; `code` is source of truth, rack inputs kept as
   provenance.
5. **Locations per SKU** — **multiple** (many-to-many; per-location stock in the inventory tables).
6. **Permissions** — **designing** placements (create/edit/delete/cascade + Picker quick-add) is
   **owner/manager only** via `store.create` (the create/edit-store ability); **reading/picking**
   during intake is open to inventory staff via `inventory.read`.
7. **Hierarchy** — **Floor + Section** added as container node types above Zone/Rack, via one
   self-referencing `parent_id` tree; **every level optional** (Bandrip stays flat).
8. **Position / shape (visual planogram)** — **deferred**; a nullable `layout jsonb` is
   **reserved** now (null, no UI) so the future floor-map needs no migration.
9. *(default, vetoable)* code uniqueness is **case-insensitive**, **per sibling group**
   (`store_id` + `parent_id`).
10. **Deleting a non-empty container** — **cascade** the soft-delete to all descendants, **after a
    confirmation dialog that names the counts** ("…also removes 2 racks and 1 zone"). No block.

## Non-goals (for this spec)

- **No visual floor-map / planogram UI** at launch (the `layout` column reserves the data door;
  the hierarchy + row/column grid already cover placement *logically*). Parked as its own item in
  [`backlog.md`](backlog.md) — "Stock Placement: visual floor-map / planogram".
- No org-level godown or store-to-store distribution here (deferred; tree kept compatible).
- No stock quantities, SKUs, barcodes, or pricing — those are the Inventory tables, specced next
  once placement is agreed.
- **No moving stock between locations** here — relocating a SKU from one placement to another is
  an *inventory stock-movement* action (Inventory module), not a change to the location list.
- **No "copy layout to another store" / templates** at launch — a real efficiency want for
  chains/franchises with similar stores; parked in [`backlog.md`](backlog.md) ("Stock Placement:
  copy a store's layout to another store").

---

*Supersedes the "Store shelves / placement scheme (Direction + Row + Column)" item in
`backlog.md` (now this active spec, broadened to Floors + Sections + Zones + Racks).*
