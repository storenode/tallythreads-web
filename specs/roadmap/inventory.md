# M3 — Inventory: catalogue, pricing, SKU/barcode labels, distribution & store stock

**Status:** Phase 1 (categories) **Built & live** (2026-09-26). Phase 2 **spec final** (2026-09-27).
**Phases 2A–2E built & live** (2026-09-27/28): catalogue → price → Finalize (SKUs) → labels →
dispatch → receive → stock on hand → place/move. Catalogue screen reworked 2026-09-28 (§11
"Catalogue UI rework"): one table grouped by invoice line, no Finalize button (SKU on first use),
row stages with locks (§7). **Phase 2G (dispatch from the Catalogue with shipment details) is
built & live (2026-09-28)**, with store **put-away** (§8: suggested rack, scan-to-move, rack QR
labels). Next: 2F.
**Version:** 2.7.0
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
 B. Price       MRP prefilled from landed cost + invoice margin (rounded up to …99)
 C. Allocate    per item: a store, or "unallocated" (stays at the org)
 D. Barcode     "Generate barcode" (or Print / Dispatch) → server assigns the SKU (needs internet);
                still editable — SKU fields / qty ask to reset the barcode (§7)
 E. Print       labels = quantity (one per sellable unit) → confirm "printed" → row LOCKED (§7)
                → stick on packages
 F. Dispatch    from the Catalogue, one dispatch per store with shipment details (courier AWB /
      │         bus-lorry LR / hand), freight + who pays, LR photo (unallocated: pick the store →
      │         SKU re-issued → print new labels). Row locked for good. Dispatched → In transit
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
  prefix the org's store codes share (`BND-KDP` → `BND`), else the name's initials; editable;
  uppercase A–Z/0–9, 2–6 chars. Used only for `UNA` SKUs. **Not globally unique** (decided in
  2A): SKUs are only resolved inside one org, and a global rule would let one customer block
  another's natural code.
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
**Changed 2026-09-28: labels carry a QR code, not Code128.** The QR holds the public lookup link
`{origin}/s/{SKU}` (`skuLookupUrl`, `features/inventory/codes.ts`): any phone's own camera app
opens the item page (`/s/:sku`, public `lookup_sku` RPC), and the in-app scanner reads it and takes
the SKU back out (`skuFromScan`); the SKU is also printed as text for **typing by hand**. Why:
a full SKU is ~310 Code128 modules, ~0.14 mm each on a 50 mm label (1.2 dots at 203 dpi); it
didn't decode even from a clean 203/300-dpi raster, or from a real iPhone photo. A QR code for the
link is a 33×33 grid, ~0.5 mm a module. The scanners still read Code128 for older labels. Trade-off:
a keyboard-wedge USB scanner must be a 2D (QR) model.

**Decision (founder, 2026-09-28): keep QR.** Considered and rejected for now: Code128 carrying a
short (~10-digit) number instead of the SKU. It decodes on a 50 mm label (90 modules, 4 dots a
module at 203 dpi) and would allow cheaper 1D scanners, but needs a new per-item number column,
and a phone's own camera app can't open an item from it.
- **Cost:** none added. Same sticker, printer and roll; only the printed pattern changes. The one
  cost difference is a future USB scanner, which must be a 2D (QR) model.
- **Durability** (simulated on a 20 mm QR at 203 dpi vs that 10-digit Code128, same damage):
  both read when new, with a torn corner (12% and 25%) and when faded or smudged. QR also read
  through a 20% stain across the centre (its error correction; Code128 failed). Code128 read through
  long scratches, but QR failed when they crossed its three corner finder squares. Error-correction
  level M stays: Q read the same, and H failed the faded case (denser modules). Neither is clearly
  more durable, so durability didn't decide it.
- **Fallbacks for a damaged sticker:** the SKU is printed as text (type it), and any item's label
  can be reprinted from the Catalogue.
- **Old stock:** direct-thermal stickers fade with heat and light (often within 6–12 months) whatever
  the code. For long-held stock, thermal-transfer (ribbon) labels last longer at a slightly higher
  cost; stick labels where they aren't rubbed or in the light.

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
  GST**. The apparel slab is decided on the value **excluding** GST (≤ ₹2,500 → 5%, above → 18%,
  `lib/gstCalc.ts`); an MRP **includes** GST, so the MRP boundary is ₹2,500 × 1.05 = **₹2,625**
  (MRP ≤ ₹2,625.00 → 5%, above → 18%). This is the usual retail reading, as with the old
  ₹1,000 / ₹1,050 rule; **confirm with the CA before Billing (M5)**. Items above ₹2,625 get an
  "18% GST" tag.
- **Visibility:** cost/margin/forecast on org screens only. Stores and labels show MRP only.
- **UI status (2026-09-28, founder):** the lot forecast card and the rounding picker / "Round all
  MRPs" were **removed from the Catalogue screen for now**. Suggested MRPs always round up to the
  next …99 (the old default); admins edit any MRP freely. `lotForecast` / `roundMrpPaise` and
  their golden tests stay in `lib/mrpPricing.ts`, ready to bring back.
- **New pure module `lib/mrpPricing.ts`** (rounding + forecast), **TDD with golden tests**,
  including the slab boundary (₹2,500.00 exactly vs ₹2,500.01) and the rounding edge cases.
  Required before Phase 2B ships.

---

## 7. Row stages and what can change (founder, 2026-09-28 — supersedes the v2.0 table)

There is **no Finalize button**. An item gets its SKU the first time it is used — **Generate
barcode**, **Print** or **Dispatch** (the `finalize_inventory_items` RPC runs underneath). From
then on it moves through four stages; the server enforces the same rules
(`inventory_items_lock_rules` trigger), so an old client or a late offline sync can't bypass them.

| Stage | Meaning | Name · MRP | Store · category · colour · size · qty | Remove |
|---|---|---|---|---|
| **1. Draft** | no barcode yet | edit | edit | yes |
| **2. Barcoded** | SKU generated, **no labels printed** | edit | edit **after "Reset this barcode?"** — the SKU is cancelled (`reset_item_sku`), the row goes back to draft, the next barcode gets the next number | after reset |
| **3. Printed** | labels printed **and confirmed** ("Yes, printed — lock") | 🔒 | 🔒 | no |
| **4. Dispatched** | any piece left the organization | 🔒 | 🔒 | no |

- **Why qty resets the barcode:** creating the SKU books the quantity into org stock (`finalize`
  movement). `reset_item_sku` reverses it with an `adjust` movement (the log is append-only).
- **Printing confirmation can't be skipped:** the browser can't tell a real print from a
  cancelled dialog, so a non-dismissible dialog asks *"Did the labels print?"* — **Yes** locks the
  rows (stage 3), **No** leaves them editable.
- **Unlock to correct…** (stage 3 → 2, owners/managers, `inventory.manage`): a reason is required
  (wrong size / colour / category / store / quantity / MRP / name / other), the user is told to
  **remove the stickers**, and `unlock_item_labels` writes an audit row to
  `inventory_item_unlocks` (item, old SKU, labels count, reason, who, when). Dispatched rows can't
  be unlocked.
- **More pieces found after printing:** add a **new row** (new barcode) — never raise a printed
  row's qty.
- **After dispatch** (fix at the store later): returns / adjustments are Phase 2F.
- A cancelled SKU number is never reused (counters only go up). Old-label scan → new SKU
  resolution (`replaced_by`) remains for the UNA → store reissue at dispatch.

**Unallocated → store:** at dispatch the org picks the store → a store SKU is issued from that
store's counter → the `UNA` item is retired (or, for a partial dispatch, shrinks by the
reissued pieces) → the dispatch form offers **Print new labels**.

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

**Put-away (built 2026-09-28).** Receive usually lands a dispatch in the stock room. Then, on the
store's **Stock in hand** tab: a hint shows how many pieces aren't on display; each item says
**"Goes on: Display · <rack>"** — the display location tagged with the item's category
(`stock_locations.category_id`, `putAway.suggestPlaces`); **scanning a packet** opens Move from
where it sits with that rack pre-selected (qty = all, editable); in Move, **scanning the rack's QR
label** picks the destination. Rack / shelf QR labels (`TTLOC:<location id>`, read only by the
in-app scanner) print from the **Stock rooms** tab ("Print place labels"). The item label is not
changed: where a piece belongs is looked up live, never printed (it changes; the sticker doesn't).
Moves stay offline-first (`stock_movements` via Dexie + outbox).

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
- **Label content:** QR code (was Code128, see §5.2), SKU text, short name, size / colour,
  **"MRP ₹1,299 (incl. of all taxes)"** (Legal Metrology wording). Fields can be toggled per
  layout, but MRP and the barcode are always on.
- Every print is logged (who, when, how many, layout), so reprints are traceable.

**As built (2C):** thermal 50×25 and 60×40 mm (38 mm dropped: a full SKU in Code 128 is too dense
for 203-dpi heads), A4 24- and 65-up, custom A4 grid (columns × rows; label size derived). The
print log is a `labels_printed` count for now (`label_prints` is still to do).

**Since 2026-09-28:** printing is **direct from the Catalogue** (row, line, selection, and new
labels after a UNA reissue) — the browser print dialog opens straight away. The separate Labels
page (`/org/:orgId/inventory/labels`) and its Inventory-header button were **removed** at the
founder's request. ⚠️ That page was the only place to choose the layout: printing now uses the
layout last saved on the device (`tt:label-layout:<org>`), else **thermal 50×25**. A layout picker
(Catalogue, or `organizations.label_settings`) is in `backlog.md`.

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
| `stock_levels` | derived on-hand per item × location | **built as a view** over `stock_movements` (security_invoker), not a trigger table |
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

### Phase 2A: Foundations (~4h) — **built & live 2026-09-27**
- [x] Migration `20260927191604_inventory_phase2a_codes.sql`: `organizations.org_code` (+ backfill:
      shared store-code prefix, else initials) and `label_settings`; `inventory_categories.code`
      (+ backfill); the `inventory_categories_assign_code` trigger (one name ↔ one code per org;
      corrects offline writes instead of rejecting them and bumps `last_modified_at` so devices
      re-pull) and the `inventory_categories_propagate_code` trigger (a code edit applies to every
      store of the org); `inventory.manage` → `org_owner`, `org_manager`. **Dry-run verified**
      twice against the live DB inside rolled-back transactions (VCS / BND backfill,
      MEN/WOM/KID/…, collision → `SAR2`, org-wide recode, rejection of another name's code).
- [x] **Applied to the live DB** (2026-09-27, version `20260927191604`) and verified: VCS / BND,
      all categories coded, both triggers, `inventory.manage` on org_owner/org_manager.
      `schema.md` v3.7.0 + `roles-and-permissions.md` updated.
- [x] Org form (create + edit, wizard Organization step): **Short code**, suggested from the name /
      store codes until typed (`OrganizationCoreFields`, component-tested).
- [x] Store code **required** and normalised (uppercase) in every store form (wizard, org Store
      create/edit), via the shared `storeCodeSchema`.
- [x] Categories card: each ticked category shows its **code**; org roles (`inventory.manage`) can
      edit it, with the clash check mirroring the trigger (`src/features/inventory/codes.ts`,
      unit-tested).
- [x] Demo seeders set `org_code` (category codes come from the trigger).
- [x] E2E: the wizard spec sets a short code and asserts category codes in the UI and the DB.
- [x] **Entry points** (added after founder review, 2026-09-27):
      - **Org console → Inventory** (`/org/:orgId/inventory`, left menu, `inventory.manage`): tabs
        **Ready for inventory** (Deliveries' approved invoices with received qty + landed cost/pc,
        the queue Phase 2B catalogues) and **Categories** (org-wide name ↔ code, which stores).
      - **Store → Inventory tab** (`/ops/:storeId/inventory`, `inventory.read`, shown only to those
        who have it): price-free: stock on hand + incoming (empty states until 2D/2E), where stock
        lives (display locations + attached stock rooms), store categories with codes.
      - E2E `e2e/inventory.spec.ts`: an org owner reaches Inventory from the left menu.

### Phase 2B: Catalogue & pricing (~12h) — **built & live 2026-09-27**
- [x] `lib/mrpPricing.ts` + 15 golden tests, written **before any UI**: rounding (always up:
      ends-99 / 49-or-99 / next ₹10), suggested MRP via `purchaseMargin`, GST inside an inclusive
      MRP (₹2,625 boundary, taxable + GST always reconciles), lot forecast net of GST (golden lot
      from the real Burrabazar numbers).
- [x] Migration `20260927195747_inventory_items.sql` (**dry-run verified**, then **applied** to the
      live DB): `inventory_items` (org-only RLS on
      `inventory.manage`; SKU unique per org; `inventory_items_guard` trigger: drafts only from
      clients, SKU/status set only by the Finalize RPC path, SKU-encoded fields frozen once
      finalized).
- [x] Dexie v12 mirror + sync (pushed after categories/locations); data layer `items.ts`.
- [x] **Catalogue screen** `/org/:orgId/inventory/invoices/:invoiceLocalId` (the "Catalogue →"
      button on Ready for inventory, with progress): per line "N of M catalogued"; item rows
      (name · category · colour · size · qty · MRP · store/Unallocated), prefilled from the line
      (suggested MRP, remaining qty, category guessed from the name); "store has no X category ·
      Add it"; "18% GST" and "Below landed cost" tags; lot forecast card; MRP rounding
      (remembered per org on the device) + "Round all MRPs". Checked at 1280px and 375px.
- [x] **Applied** (founder go-ahead) and verified (RLS on, 3 policies, guard trigger); `schema.md`
      v3.8.0. Security advisor: the trigger functions' API EXECUTE was revoked
      (`20260927195843`).
- [ ] E2E: Ready for Inventory → catalogue → allocate (needs the migration live).

### Phase 2C: Finalize + labels — **built & live 2026-09-28**
- [x] Migration `20260927222247_inventory_distribution.sql` (dry-run verified as org owner and as
      a store sales person, then applied): `sku_segment()`, `sku_counters`,
      `next_inventory_sku()` (counter upsert = row lock, so concurrent finalizes can't share a
      number; SKU also unique per org), `finalize_inventory_items(uuid[])` (online only; checks
      `inventory.manage`, the store's category by code, the store / org code; writes a
      `finalize` movement into org holding). Verified: `BND-KDP-STR-BLACK-XL-0001`,
      `BND-UNA-STR-SKYBLU-FREE-0001`.
- [x] *(Superseded 2026-09-28 — no Finalize button, SKU on first use, §7.)* Catalogue **Finalize & labels** card: pushes pending edits first, then the RPC; blocks on
      zero MRP / missing store category / missing store code. Finalized rows show the SKU and
      lock everything except MRP.
- [x] *(Page removed 2026-09-28 — direct printing from the Catalogue, §9.)* **Labels page** `/org/:orgId/inventory/labels` (`?items=id:qty,…` for reprints and
      reissues): Code 128 (JsBarcode) + name, colour · size, "MRP ₹499 · incl. of all taxes";
      layouts thermal 50×25 / 60×40 mm, A4 24-up and 65-up, custom A4 grid; start-at-N for used
      sheets; any printer via `react-to-print`; layout remembered per org **on the device**;
      "They printed — mark done" bumps `labels_printed`. Layout maths unit-tested
      (`labels.test.ts`).
- [ ] Change rules (§7) after finalize: retire / reissue for store·category·colour·size edits,
      qty up/down, un-finalize before first print, old-label scan → new SKU. (Today: MRP and name
      stay editable → reprint; the rest is locked, and the only reissue is UNA → store at
      dispatch.)
- [ ] `label_prints` audit log + `organizations.label_settings` (org-wide default).
- [ ] E2E: finalize → SKU format → print preview (needs `E2E_ADMIN_JWT`; the live RPCs were
      verified by rolled-back SQL runs instead).

### Catalogue UI rework — **built 2026-09-28**
- [x] **One TanStack table per invoice, grouped by invoice line** (all groups open by default):
      group row = checkbox (ticks the line) · ▼ · "1) Line name [N of M catalogued]" · received /
      landed / suggested MRP on the left; "🔒 All finalized" · **+ Add item** · **Print labels** on
      the right (sized to the visible scroll width, sticky while columns scroll). Checkbox + Name
      pinned; every cell `isolate`d so controls never paint over the pinned cells.
- [x] Columns: Name · Category · Colour · Size · Qty · MRP (18% GST / below-landed tags) · Store
      (missing-category "Add it") · **Dispatch** (—, Dispatch N, N in transit → store, Received x/y)
      · **Label** (SKU / "No barcode yet", 🔒 N printed / 🔒 Dispatched, **Generate barcode** /
      Barcode preview, **Print N** / Reprint N, **Unlock to correct…**) · 🗑.
- [x] **Phones:** accordion, one section per line (open by default), item cards inside.
- [x] **Selection** (across lines) only drives the buttons: **Dispatch selected**, **Print
      selected** (both create missing SKUs first).
- [x] **No Finalize button**; row stages + locks as in §7.
- [x] **Direct printing** (§9) with the non-dismissible "Did the labels print?" confirmation.
- [x] Removed: lot forecast card, MRP rounding card (§6), the "Finalize & labels" card, the
      per-line cards, the Labels page, the Inventory **Stock & dispatch** tab.

### Phase 2G: Dispatch from the Catalogue with shipment details — **built & live 2026-09-28**
Goal: dispatch straight from each Catalogue line and record **how** stock travels (courier AWB,
bus/travels parcel LR, lorry, hand delivery), who pays the freight, and a photo of the LR/receipt.
The org **Stock & dispatch** tab is then **removed**.

**Decisions (founder):** freight is recorded with **who pays** — organization or store (to-pay on
delivery), no landed-cost change; ticked rows for several stores → **one dispatch per store**,
each with its own shipment details; **no modal** — Dispatch replaces the **whole table** with the
dispatch form and **← Back to items** (URL `?dispatch=1`, `?ship=<transfer>` for Edit shipment, so
the phone back button works; after a reload the form falls back to the whole invoice); capture a
**photo of the LR / courier receipt**.

**Status:** built and **applied live** (`20260928140000_dispatch_shipments`, after a rolled-back dry
run of 21 checks on demo data as the org owner and a Kadapa sales person, repeated against the live
functions: courier needs an AWB; dispatch + shipment saved; dispatched rows locked; partial UNA
reissue shrinks the UNA item (80 → 50); reset / unlock / printed-lock; store sees store-paid freight
only; receive into the stock room; put-away onto the category rack). The migration also carries the
§7 lock trigger, `reset_item_sku`, `unlock_item_labels` + `inventory_item_unlocks`, and
`hard_delete_organization` clean-up of `dispatch-receipts` (see `schema.md` §3D).
- [x] Store put-away (§8): suggested rack, scan-a-packet → Move, scan the rack QR, rack labels.
- [x] `e2e/stock-flow.spec.ts`: Catalogue → Dispatch (courier) → Receive → put away, DB-checked at
      each step. ⚠️ Needs `E2E_ADMIN_JWT` (not run in the build session).

**DB (one migration; show the SQL to the founder before applying live):**
- `stock_transfers` + nullable columns: `transport_mode` (CHECK courier/bus/lorry/hand/other),
  `carrier_name`, `tracking_no` (AWB / docket / LR), `vehicle_no`, `contact_name`,
  `contact_phone`, `packages` (> 0), `expected_at` date, `freight_paise` (≥ 0),
  `freight_paid_by` (CHECK org/store; required when freight is set), `receipt_path`.
- Private bucket `dispatch-receipts` (`{org_id}/{transfer_id}/…`, images ≤ 5 MB, compressed
  client-side): org `inventory.manage` read/write; receiving store `inventory.read` read.
- `dispatch_stock(store, lines, note, p_shipment jsonb default null)` (drop + recreate; the
  server validates mode, tracking no. required for courier/bus/lorry, freight needs a payer).
- New `update_transfer_shipment(transfer, shipment)` — edit details / attach the photo while
  `dispatched`; locked once received.
- `store_incoming` returns the shipment summary; `freight_paise` **only when the store pays**
  (stores never see org costs).

**UI:**
- Catalogue table gets a **Dispatch** column (was "Status"; the per-row Draft/Finalized badge was
  dropped — line status is in the group row): "Dispatch 25" → "25 in transit → Nellore" →
  "Received 25/25" (from `stock_levels`, via `useOrgStockLevels` + `orgHoldings`). Drafts show
  "Dispatch N" too (the SKU is created first); offline "—".
- **Dispatch selected** next to Print selected. The dispatch form groups lines by store: pieces
  per SKU, mode-specific fields, boxes, contact, expected date, freight ₹ + paid by, receipt
  photo, note. UNA rows pick a store; after dispatch the form offers **Print new labels**
  (direct print). Online only (like Finalize).
- Per-invoice **Dispatches** list under the table (store, shipment summary, 📷, In transit /
  Received x/y, **Edit shipment** — same form with ← Back).
- Store **Receive** page shows "KPN Travels · LR 4471 · 3 boxes · expected 30 Sep", "To pay
  ₹350" when store-paid, and the receipt photo.
- Old tab's pieces: builder → Catalogue form; recent dispatches → per-invoice list; at-org /
  in-transit / in-stores counts → per-invoice counts on the **Ready for inventory** tab; SKU
  scan-to-dispatch dropped (ask the founder if it's missed). Delete `StockDispatchTab.tsx`.

**Tests:** vitest golden tests for `validateShipment` / `shipmentSummary` (incl. freight payer
visibility); one live dispatch on a demo org checked from both org and store side.
**Order:** migration + bucket + RPCs → types + `schema.md` → helpers + tests → Catalogue column /
form / selection / Dispatches list → Receive page, Ready-tab counts, remove the old tab → docs +
journal. Add "store-paid freight in franchise settlement" to `backlog.md`.

### Phase 2D: Dispatch & receive — **built & live 2026-09-28**
- [x] `stock_transfers` + `stock_transfer_items` (readable by the org or the receiving store;
      written only by RPCs), `stock_movements` (append-only: immutable trigger; location-in-store
      validation trigger), `stock_levels` **view** (security_invoker, derived — no trigger table).
- [x] `dispatch_stock(store, lines, note)`: checks org holding; UNA lines are **reissued** as a
      new store-SKU item (UNA retired when fully moved, `replaced_by_item_id`), then org →
      transit movements. *(Tab removed 2026-09-28 — dispatch lives on the Catalogue, Phase 2G.)* Org **Stock & dispatch** tab: overview (at org / MRP value / in transit /
      in stores), builder (store → qty per SKU, "All", scan +1, note), reissue result with
      **Print the new labels →**, recent dispatches with received x/y.
- [x] `receive_transfer(transfer, lines, warehouse?, location?)`: transit → store movements,
      `shortage` / `excess` rows. Store **Receive** page `/ops/:storeId/inventory/receive/:id`:
      scan (keyboard-wedge scanner, typed, or phone camera via `BarcodeDetector`), ± per SKU,
      "Everything arrived", destination (default: first stock room), short/extra summary.
- [x] `store_incoming(store)` (dispatched + received in the last 7 days, price-free).
- [ ] Reprint **gate** before dispatch (§7): the dispatch completes immediately and links to the
      reprint instead. Revisit if stores receive un-relabelled UNA stock.
- [ ] E2E: dispatch → receive by typed SKU (needs `E2E_ADMIN_JWT`; verified by SQL dry run).

### Phase 2E: Store stock — **built & live 2026-09-28**
- [x] `store_stock(store)` RPC (price-free: no landed cost; MRP shown as on the label).
- [x] *(Reorganised 2026-09-28 into tabs **Stock in hand** · **Incoming Stock** (dispatches →
      Receive, then the trip feed) · **Stock rooms** — see §8 put-away.)* Store **Inventory** tab:
      Incoming (→ Receive), **Stock on hand** by slot (stock room ·
      location / display · location / unplaced), find by SKU or name (scan), last good result
      cached per store for offline.
- [x] **Place / Move** dialog: `stock_movements` row (`place` from unplaced, else `move`) through
      Dexie v13 + outbox (push-only table), overlaid on the last stock until synced. RLS: store
      staff may insert only place/move within their own store (cross-store blocked, verified).
      Overlay maths unit-tested (`distribution.test.ts`).
- [ ] E2E: move offline → reconnect → movement synced (needs `E2E_ADMIN_JWT`).

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
- **v2.7.0 (2026-09-28)**: Phase 2G **applied live**. Store put-away (§8): "Goes on" suggestion from
  the category-tagged rack, scan a packet → Move, scan the rack's QR, rack / shelf QR labels. Store
  Inventory tabs: Stock in hand · Incoming Stock (dispatches → Receive first) · Stock rooms.
- **v2.6.0 (2026-09-28)**: Labels print a **QR code** of the public lookup link instead of Code128
  (full-SKU Code128 on 50 mm is too dense to scan); public item page `/s/:sku`; scanners read QR +
  Code128; iPhone scans from a photo. §5.2 records the decision, cost and durability tests.
- **v2.5.0 (2026-09-28)**: Catalogue = one table grouped by invoice line (phone accordion); no
  Finalize button — SKU on first use; row stages Draft → Barcoded → Printed → Dispatched with the
  §7 lock rules (reset barcode, non-skippable print confirmation, unlock with a reason). Labels page
  and Stock & dispatch tab removed; printing and dispatch live on the Catalogue. Phase 2G client
  built; migration `20260928140000_dispatch_shipments` written, not applied. §7 rewritten.
- **v2.4.0 (2026-09-28)**: Catalogue UI rework (TanStack table, row selection, direct label
  printing, barcode preview; lot forecast and rounding picker removed from the screen). Phase 2G
  (dispatch from the Catalogue with shipment details, LR photo, freight payer; retire the Stock &
  dispatch tab) planned with the founder.
- **v2.3.0 (2026-09-28)**: Phases 2C–2E built and applied live (`inventory_distribution`): SKU
  counters + Finalize RPC, labels page (any printer), dispatch with UNA reissue, store receive by
  scan, stock on hand, offline place/move. `stock_levels` is a view. Also fixed live
  (`fix_permission_scope`): store memberships were counted as org-level in
  `has_org_permission` / `has_store_permission`, so store staff could read and write every store
  of their org; staff may now read only the stock rooms attached to their store.
- **v2.2.0 (2026-09-27)**: Phase 2B built (pricing engine + tests, `inventory_items` migration
  written and dry-run verified but not applied, catalogue screen). GST MRP boundary is ₹2,625
  (inclusive), not ₹2,500.
- **v2.1.0 (2026-09-27)**: Phase 2A built (migration written and dry-run verified, **not
  applied**). `org_code` is not globally unique (SKUs are org-scoped). Category codes are enforced
  server-side by triggers (assign/normalise + org-wide propagation).
- **v2.0.0 (2026-09-27)**: Phase 2 redesigned with the founder and **finalized**. The org
  catalogues Ready-for-Inventory lines, prices them (landed-cost suggestion, rounding, net-of-GST
  forecast), allocates, finalizes (server SKUs), prints labels and dispatches. Stores receive,
  place and move. New `org_code` + category `code`; `UNA` SKUs for unallocated stock; the
  retire / reissue / reprint rules; append-only movements with derived levels (an exception to
  LWW for quantities); `inventory.manage` permission; any-printer labels. Replaces the v1
  per-store `inventory` master + `sku_template` design. Phased plan 2A–2F (~50h).
- **v1.1.0 (2026-09-26)**: demo category seeding + wizard e2e coverage.
- **v1.0.0 (2026-09-26)**: Phase 1 categories live; Phase 2 first design.
