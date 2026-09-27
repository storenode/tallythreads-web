# M3 — Inventory: catalogue, pricing, SKU/barcode labels, distribution & store stock

**Status:** Phase 1 (categories) **Built & live** (2026-09-26). Phase 2 **spec final** (2026-09-27),
not started. Build begins with Phase 2A on the founder's go-ahead.
**Version:** 2.0.0
**Est:** see §11 (M3 is 36h in constitution §5 and needs revising; this spec's phases total ~50h)
**Tracking:** [storenode/tallythreads-web#30](https://github.com/storenode/tallythreads-web/issues/30)
**Builds on:** Deliveries (`deliveries.md`) → Stock Placement (`stock-placement.md`) → Warehouses /
stock rooms (`warehouses.md`) → Categories (Phase 1 below). Schema: `../reference/schema.md` §3B–§3D.

---

## 0. What this is (read this first, no prior context needed)

TallyThreads is an offline-first PWA for Indian cloth/garment retailers: independent shops,
multi-store chains and franchises. **Every org type uses the same flow.** An independent shop is
simply an organization with one store (it still has an org id *and* a store id), so there are
no per-type branches.

Stock arrives through **Purchase Trips** (the owner buys at Surat/Kerala/…; each supplier
invoice's **landed cost** is known) and is received through **Deliveries**, which ends at
**Ready for Inventory**. This module takes over from there:

1. **At the organization** (owner / org manager): turn received invoice lines into sellable
   **items** (name, category, colour, size, quantity, **MRP**). Plan which **store** each lot goes
   to, **finalize** (the system generates the **SKU**), **print barcode labels**, stick them on
   the packages, and **dispatch** to the stores.
2. **At the store** (store manager / sales staff): **receive** the packages (scan to confirm the
   count), **place** them in the store's **stock room** or on a **display location**
   (rack / section / zone), and **move** them later (stock room → display and back).

The store **never creates or edits items and never sees cost**. The barcode is already on the
package, so the store only records **where** the stock is.

**Why it matters:** this closes the loop of the product's core differentiator (constitution §2.IV):
Purchase Trip → landed cost → **MRP with a visible margin forecast** → labelled stock in the
right store. It is also the prerequisite for Billing (M5), which sells by scanning these labels.

---

## 1. Scope

**In scope (Phase 2):**
- Cataloguing Ready-for-Inventory invoice lines into items; MRP pricing with landed-cost
  suggestion, Indian price-point rounding and a lot-level margin forecast.
- Allocation to stores (or leaving stock **unallocated** at the org).
- SKU generation at Finalize; Code128 barcode labels for any printer.
- Dispatch (org → store), store receive, place, move; stock on hand per location; movement log.
- The rules for changes after printing (retire and reissue, reprint).
- Adjustments (damaged / missing) and stock count (Phase 2F).

**Out of scope (later modules / explicitly not here):**
- Selling / billing / GST invoices: **M5**. Billing will scan these SKUs.
- Store → store rebalancing beyond the basic transfer: the same `stock_transfers` mechanism,
  but it gets its own UI later.
- Franchise settlement on transfers: M1d. A dispatch to a franchise store will later feed
  `deduct_expenses` / stock-share; not built here.
- Visual planogram, AI descriptions (Assistant, `assistant.md`), supplier master.
- Direct Bluetooth/ESC-POS or raw ZPL/TSPL printing. Labels go through the browser print dialog.

---

## 2. Who does what

| Action | Organization (`org_owner`, `org_manager`) | Store (`store_manager`, `store_sales_staff`, `store_temp_staff`) |
|---|---|---|
| See Ready-for-Inventory lines, landed cost, margin | ✅ | ❌ |
| Catalogue items (name, category, colour, size, qty, MRP) | ✅ | ❌ |
| Allocate to a store / leave unallocated | ✅ | ❌ |
| Finalize (generate SKUs) | ✅ | ❌ |
| Print / reprint labels | ✅ | ✅ reprint only (torn label, same SKU) |
| Dispatch to a store | ✅ | ❌ |
| Receive a dispatch (scan, confirm count) | — | ✅ |
| Place received stock (stock room / display location) | — | ✅ |
| Move stock room ↔ display location | — | ✅ |
| See stock on hand | all stores + org holding | own store + its attached stock rooms (MRP only, **no cost**) |
| Record adjustment (damaged / missing) | ✅ approve | ✅ record; `store_manager` approves small ones (§8) |

**Permissions** (catalogue: `../reference/roles-and-permissions.md`):
- **New `inventory.manage`** (`org_owner`, `org_manager`): catalogue, price, finalize, print,
  retire/reissue. Needed because `inventory.write` is also held by store roles.
- **`stock.transfer.create` / `.read`** (already seeded; org roles): dispatch.
- **`inventory.write`** (store roles + org roles): receive, place, move, record adjustments.
- **`inventory.read`**: stock on hand (MRP only).
- **Cost fields** (landed cost, margin) are readable only by org roles (the holders of
  `trip.read`). Store staff read items through a **price-free view**, the same pattern as the
  live `incoming_stock` view (§10).

---

## 3. End-to-end flow

```
Deliveries: invoice reaches "Ready for Inventory"          (stock physically at the org)
      │
      ▼  ORGANIZATION
 A. Catalogue   split each invoice line into items: name · category · colour · size · qty · MRP
 B. Price       MRP prefilled from landed cost + invoice margin → optional rounding → lot forecast
 C. Allocate    per item: a store, or "unallocated" (stays at the org)
 D. Finalize    server assigns SKUs (needs internet) → items locked into the SKU rules (§7)
 E. Print       labels = quantity (one per sellable unit) → stick on packages
 F. Dispatch    to a store (unallocated items: pick the store now → SKU re-issued → reprint)
      │         status: Dispatched → In transit
      ▼  STORE
 G. Receive     scan labels to confirm the count → shortage/excess flagged (as in Deliveries)
 H. Place       each package → the store's stock room OR a display location
 I. Move        stock room ↔ display (scan · pick "to" · done), any time, offline
```

**Invoice line → items.** A received invoice line (e.g. "Cotton saree", received qty 20, landed
₹1,050/unit) is split into one or more items by colour × size (and store). The item
quantities for a line must **sum to the line's received quantity** (`received_quantity`, which
Deliveries records). The Catalogue screen shows "12 of 20 catalogued" until they match. Every
item from the line inherits the line's **landed unit cost**.

**Piece vs pack.** One label per **sellable unit**. A pack sold as one (a 6-pack of vests) is
quantity 1 with one label, and the pack size goes in the name ("Vests, 6-pack").

---

## 4. The item record (what the org enters)

Required and **only** these: **name, category, colour, size, quantity, MRP.**
- **Colour / size**: free text with suggestions from earlier entries (no master list to
  maintain). Normalised for the SKU (§5).
- **Category**: chosen from category names in use across the org's stores. When the item
  is allocated to a store, it binds to *that store's* category with the same name/code (§5.3).
- **MRP**: per item (sizes may differ), in paise (constitution §2.V). See §6.
- System fields (not typed): `source_invoice_item_id`, `landed_unit_cost_paise`, store,
  status, SKU.

---

## 5. SKU & barcode

### 5.1 Format
```
{store_code}-{CAT}-{COLOR}-{SIZE}-{SEQ}        BND-KDP-SAR-RED-FREE-0042    allocated to a store
{org_code}-UNA-{CAT}-{COLOR}-{SIZE}-{SEQ}      BND-UNA-SAR-RED-FREE-0007    not yet allocated
```
- **`store_code`**: the store's existing code (`stores.store_code`, e.g. `BND-KDP`). **Required
  to finalize**: Finalize is blocked for a store without one, with a link to fill it in.
  (Live check 2026-09-27: all 5 stores have codes.)
- **`org_code`**: **new** short code on the organization (e.g. `BND`). Suggested from the
  name, editable, unique, uppercase A–Z/0–9, 2–6 chars. Used only for `UNA` SKUs.
- **`CAT`**: **new** category code on `inventory_categories` (e.g. Sarees → `SAR`). Generated
  from the name (first 3 letters, uppercase), editable, unique within the store, **locked once
  any SKU uses it**. **Org-wide consistency rule:** within one org, a category name maps to one
  code in every store ("Sarees" is `SAR` everywhere), so unallocated stock can be re-bound.
- **`COLOR` / `SIZE`**: normalised from the free text: uppercase, spaces/punctuation removed,
  max 6 chars (Red → `RED`, Sky blue → `SKYBLU`, Free size → `FREE`, 38 → `38`).
- **`SEQ`**: 4-digit zero-padded running number (grows past 9999 if needed), **per store +
  category** (`UNA`: per org + category). **Assigned by the server at Finalize** so two devices
  can never collide.
- Uniqueness: a SKU is unique **within the organization** (barcodes are only scanned inside the
  org's own app).

### 5.2 Barcode
Value = the SKU string, rendered as **Code128** (JsBarcode, already in the stack). One value
works for a Bluetooth/USB scanner (keyboard wedge), the Android camera, or **typing the SKU by
hand**, so a salesperson is never blocked.

### 5.3 Categories stay store-scoped
Phase 1 is unchanged: each store defines its own categories. The org sees them **grouped by
name/code**. A `UNA` item carries only the category **code**. At dispatch it binds to the
chosen store's category with that code. If the store doesn't carry it, dispatch stops with
**"Kadapa has no 'Sarees' category: add it?"** (one click).

---

## 6. MRP pricing (money logic, constitution §2.V)

Shown per item on the org's Catalogue screen:
- **Landed cost / unit**: from the Purchase Trip (`lib/landedCost.ts`, already tested).
- **Suggested MRP**: `landed × (1 + margin)` using that invoice's margin config
  (`lib/purchaseMargin.ts`, already tested). Prefilled; the admin edits freely.
- **Rounding** (optional, per lot, remembered per org). Always rounds **up** so margin is never
  lost:
  - *Ends in 99*: ₹1,260 → ₹1,299; ₹1,300 → ₹1,399.
  - *Ends in 49 / 99*: ₹1,260 → ₹1,299; ₹1,210 → ₹1,249.
  - *Nearest ₹10 (up)*: ₹1,261 → ₹1,270.
- **Lot forecast** (updates live as MRPs change): expected revenue `Σ qty × MRP`, landed cost
  `Σ qty × landed`, margin ₹ and %. **MRP includes GST**, so the forecast shows margin **net of
  GST** using `lib/gstCalc.ts` (apparel slab per piece: ≤ ₹2,500 → 5%, > ₹2,500 → 18%). A
  warning appears when an MRP crosses the ₹2,500 slab ("GST jumps 5% → 18% at this price").
- **Visibility:** cost/margin/forecast on org screens only. Stores and labels show MRP only.
- **New pure module `lib/mrpPricing.ts`** (rounding + forecast), **TDD with golden tests**,
  including the slab boundary (₹2,500.00 exactly vs ₹2,500.01) and the rounding edge cases.
  Required before Phase 2B ships.

---

## 7. Changes after labels are printed (retail standard)

A printed SKU is **never edited or reused**. It is either kept or **retired**.

| What changes | SKU | Labels |
|---|---|---|
| Quantity up (more pieces found) | same | print the extra labels |
| Quantity down (damaged / miscount) | same | remove extras; adjustment logged with a reason |
| MRP or name | same | **reprint** (the label shows MRP; it must match what the customer sees) |
| Store, category, colour or size | **old retired → new issued** | reprint the new label over the old one |
| Label torn / lost | same | reprint only |

- Store, category, colour and size are **encoded in the SKU text**; quantity, MRP and name are not.
- A **retired** SKU is kept forever (`replaced_by`), and its number is never reused. Scanning an
  old label resolves to the new SKU with a warning: *"This label was replaced, reprint it."*
- Before printing, a finalized item may be **un-finalized** only if no label has ever been
  printed (the SKU is then retired, not deleted).

**Unallocated → store:** at dispatch the org picks the store → a store SKU is issued from that
store's counter → the `UNA` SKU is retired and linked → **reprint** is required before the
dispatch can be marked *Dispatched* (the app shows "3 packages need new labels").

---

## 8. Stock on hand, locations and movements

**Where stock can be** (one "location" = exactly one of):
1. **Org holding**: at the organization, not yet dispatched (optionally a specific org-level
   warehouse / godown, `warehouses.md`).
2. **Store stock room**: a warehouse attached to the store (`warehouse_stores`), optionally a
   specific `stock_location` inside it.
3. **Store display**: a store-owned `stock_location` (floor / section / zone / rack).
4. **Store, unplaced**: received but not yet placed (placement is optional, as a small shop
   may not track racks).

**Movement log (append-only).** Every change is a `stock_movements` row: `intake`, `dispatch`,
`receive`, `place`, `move`, `adjust` (reason: damaged / missing / found / count), `reissue`.
Quantities on hand (`stock_levels`) are **derived** from movements by the server, never edited
directly.

**Why append-only (architecture note):** constitution §6's default conflict rule is
last-write-wins. That is safe for descriptive fields but **wrong for quantities**: two offline
devices each moving 2 pieces would overwrite each other. Movements are **insert-only** (no
conflicts), and levels are computed from them. Clients show optimistic local levels until sync.

**Adjustments:** store staff record them. `store_manager` approves up to a threshold (default 2
units or ₹2,000 per adjustment, configurable per org); above that, the org approves.
**Stock count** (Phase 2F): count a location by scanning; differences become proposed
adjustments.

---

## 9. Labels & printing

- Printed **last**, after catalogue, allocation and finalize. **Labels = quantity** (one per
  sellable unit). Batches per store or per dispatch.
- **Any printer**, through the browser print dialog (`react-to-print`, already in the stack): TSC /
  Zebra thermal, inkjet / laser with A4 label sheets. No drivers or Bluetooth needed.
- **Layout chosen at Print time**, with the last choice remembered as the org default
  (`organizations.label_settings`):
  - Thermal roll: 50×25 mm, 38×25 mm, 2-up.
  - A4 sheet: 24 / 40 / 65 per sheet, with **"start at label N"** so a half-used sheet isn't wasted.
  - Custom: width × height (mm) and columns.
- **Label content:** Code128 barcode, SKU text, short name, size / colour,
  **"MRP ₹1,299 (incl. of all taxes)"** (Legal Metrology wording). Fields can be toggled per
  layout, but MRP and the barcode are always on.
- Every print is logged (who, when, how many, layout), so reprints are traceable.

---

## 10. Data model (proposed, not migrated; the live DB stays the source of truth)

All tables: `id uuid` (client-generated), `organization_id`, `last_modified_at`, `deleted_at`,
integer **paise** for money, RLS on, Dexie mirror + outbox (constitution §6).

| Table / change | Purpose | Key columns |
|---|---|---|
| `organizations.org_code` *(new column)* | SKU prefix for `UNA` | text, unique, `^[A-Z0-9]{2,6}$` |
| `organizations.label_settings` *(new)* | default print layout | jsonb |
| `inventory_categories.code` *(new)* | `CAT` segment | text, unique per store, org-wide name↔code rule |
| `inventory_items` | one row per SKU (item × store allocation) | `source_invoice_item_id`, `store_id` (null = UNA), `category_id` (null for UNA), `category_code`, `name`, `color`, `size`, `quantity`, `mrp_paise`, `landed_unit_cost_paise`, `status` (`draft`/`finalized`/`retired`), `sku` (null until finalize), `replaced_by_item_id`, `finalized_at`, `labels_printed` (count) |
| `sku_counters` | server-side running numbers | `(organization_id, scope, category_code)` unique, `next_seq`; `scope` = store_id or `UNA`. (Supersedes the unused `inventory_categories.next_sequence`.) |
| `stock_transfers` + `stock_transfer_items` | dispatch org → store (and later store → store) | status `draft`/`dispatched`/`received`, `to_store_id`, per-item `qty_sent`, `qty_received`, note. (Name aligned with constitution §6.) |
| `stock_movements` | append-only log | `item_id`, `qty`, `kind`, from/to location, `transfer_id`, `reason`, `member_id`, `created_at` |
| `stock_levels` | derived on-hand per item × location | maintained by trigger from `stock_movements`; read-only to clients |
| `label_prints` | print audit | `item_id`, `qty`, `layout`, `member_id`, `printed_at` |
| `store_inventory` *(view)* | price-free store feed | item fields **minus** `landed_unit_cost_paise`; store-scoped (like `incoming_stock`) |

**Server functions (security definer):**
- `finalize_inventory_items(item_ids uuid[])`: validates codes, assigns SKUs from
  `sku_counters` atomically. **Online only.**
- `reissue_inventory_item(item_id, new_store_id | new_category/color/size)`: retires the old SKU
  and issues a new one.

Offline everywhere else: cataloguing, pricing, allocation drafts, printing (of already-finalized
SKUs), receive, place, move and adjustments write to Dexie first.

---

## 11. Phased build plan

Each phase ships on its own with tests, is verified offline where relevant, and is checked at
375px (constitution §7).

### Phase 2A: Foundations (~4h)
- [ ] Migration: `organizations.org_code` (+ backfill a suggestion for existing orgs),
      `organizations.label_settings`, `inventory_categories.code` (+ backfill from names, per-org
      consistency), `inventory.manage` permission → `org_owner`, `org_manager`.
- [ ] Wizard: Organization step gets **Short code**; Stores step marks **Store code** required;
      category code shown (editable) in the Categories card.
- [ ] Demo seeders set `org_code` + category codes.
- [ ] `schema.md` + `roles-and-permissions.md` updated to match the live DB.

### Phase 2B: Catalogue & pricing (~12h)
- [ ] `lib/mrpPricing.ts` + golden tests (rounding, forecast, GST slab boundary): **before any UI**.
- [ ] `inventory_items` table + RLS + Dexie mirror + sync.
- [ ] Org **Inventory** nav → "Ready for Inventory" list → Catalogue screen per invoice line
      (split into items, received-qty balance, MRP with suggestion / rounding / forecast).
- [ ] Allocation per item (a store or Unallocated).
- [ ] E2E: Ready for Inventory → catalogue → allocate (desktop + 375px).

### Phase 2C: Finalize + labels (~12h)
- [ ] `sku_counters` + `finalize_inventory_items` RPC + SQL tests for concurrency / uniqueness.
- [ ] SKU normalisation helpers (colour/size) with unit tests.
- [ ] Label print: layouts (thermal / A4 / custom), start-at-N, org default, `label_prints` log.
- [ ] Change rules (§7): retire / reissue, reprint, qty up/down; old-label scan resolves.
- [ ] E2E: finalize → SKU format asserted → print preview renders N labels.

### Phase 2D: Dispatch & receive (~12h)
- [ ] `stock_transfers` (+ items), `stock_movements`, `stock_levels` trigger.
- [ ] Org: dispatch builder (by store; `UNA` → pick store → reissue → reprint gate).
- [ ] Store: incoming dispatches → **Receive** by scanning (shortage/excess, like Deliveries).
- [ ] E2E: dispatch → store receives by typed SKU → levels correct on the server.

### Phase 2E: Store stock (~6h)
- [ ] Store **Inventory** tab (`/ops/:storeId/inventory`, today a stub): stock on hand, price-free,
      search / scan.
- [ ] **Place** received stock; **Move** stock room ↔ display (scan · pick "to" · done), offline.
- [ ] E2E: move offline → reconnect → movement + level synced.

### Phase 2F: Adjustments & stock count (~4h)
- [ ] Adjustments with reasons + approval threshold; stock count by location.

**Total ≈ 50h** vs M3's 36h in constitution §5. To be reconciled in §5 when Phase 2A starts.

---

## 12. Decisions locked (2026-09-27, founder)

1. One flow for all org types; independent = one store, no special case.
2. Ready-for-Inventory stock is handled **at the organization**. The org catalogues, prices,
   generates SKUs, prints and dispatches. Stores only receive, place and move.
3. Item fields: name, category, colour, size, quantity, MRP. **Pack = one unit**.
4. MRP set by the org admin at cataloguing, from the Purchase-Trip landed cost, with a forecast.
5. SKU `{store_code}-{CAT}-{COLOR}-{SIZE}-{SEQ}`; `UNA` form for unallocated stock; generated at
   **Finalize** by the server.
6. Unallocated stock gets a `UNA` SKU, re-issued with the store code at dispatch, then reprint.
7. After printing: the retire / reissue / reprint rules in §7.
8. Short **org code** and **category code** added and included in SKUs.
9. Labels printed last, one per sellable unit, any printer, layout chosen at print time.

## 13. Open (small, decide during build)
- Adjustment approval threshold default (2 units / ₹2,000). Confirm in Phase 2F.
- Whether a store may print labels for stock **it** finds without one (reprint only, today).
- Max length / truncation for very long custom category names in `CAT`.

---

## Phase 1: Categories (Built & live, 2026-09-26)

Each store defines its own **categories/departments** (Sarees, Dress Material, Kids…). Store-scoped
(`inventory_categories`): an org can have "Kids" in one store and not another.

- **Where:** the wizard's **Stores step**, inside the store **edit** form (needs a `store_id`),
  above Cancel/Save. A responsive checkbox grid of standard cloth-store departments plus
  **+ Add category** for custom ones. Staged and persisted with the store's Save (create
  newly-checked, soft-delete unchecked), offline-first.
- **Placement tag:** in **Stock setup**, a floor/section/zone/rack can be tagged with one of the
  store's categories (`stock_locations.category_id`). Store-owned locations only.
- **Offline:** Dexie v11 `inventory_categories` + `stock_locations.category_id`; synced via the
  outbox (categories push before locations). Data layer: `src/features/inventory/categories.ts`.
- RLS: `has_store_permission`, read `inventory.read`, write `inventory.write`.
- **Demo (`/admin/demo`):** every demo store is seeded with categories by org type
  (`categories.demo.ts`) via direct server insert, **before** the placement tree, so demo
  sections/zones carry a `category_id`.
- **E2E:** `e2e/org-setup-wizard.spec.ts` ticks two standard + one custom category, re-opens the
  store, and verifies the rows sync to Supabase.

---

## Changelog
- **v2.0.0 (2026-09-27)**: Phase 2 redesigned with the founder and **finalized**. The org
  catalogues Ready-for-Inventory lines, prices them (landed-cost suggestion, rounding, net-of-GST
  forecast), allocates, finalizes (server SKUs), prints labels and dispatches. Stores receive,
  place and move. New `org_code` + category `code`; `UNA` SKUs for unallocated stock; the
  retire / reissue / reprint rules; append-only movements with derived levels (an exception to
  LWW for quantities); `inventory.manage` permission; any-printer labels. Replaces the v1
  per-store `inventory` master + `sku_template` design. Phased plan 2A–2F (~50h).
- **v1.1.0 (2026-09-26)**: demo category seeding + wizard e2e coverage.
- **v1.0.0 (2026-09-26)**: Phase 1 categories live; Phase 2 first design.
