# Inventory module

**Status:** phase 1 (categories) **live** (2026-09-26); master/items + SKU/barcode **designed, not
built**. Store-scoped, managed by the org's stores, offline-first. Schema: `../reference/schema.md`
§3B–§3D. Builds on Stock Placement (`stock-placement.md`) and Warehouses (`warehouses.md`).

Inventory is **managed at the organization level, by its stores** — each store owns its own
categories and stock. It lives in the org console (`/org/:orgId`) and the setup wizard.

---

## Phase 1 — Categories (LIVE)

Each store defines its own **categories/departments** (Sarees, Dress Material, Kids…). Store-scoped
(`inventory_categories`) — an org can have "Kids" in one store and not another.

- **Where:** the wizard's **Stores step**, inside the store **edit** form (needs a `store_id`, so it
  appears once the store exists), **above the Cancel/Save row**. A responsive **checkbox grid** of
  standard cloth-store departments (Sarees, Kids, Dress Materials…) preselected by what the store
  already has, plus **+ Add category** for custom ones. The selection is **staged and persisted as
  part of the store's Save** (create newly-checked, soft-delete unchecked) — offline-first.
- **Placement tag:** in **Stock setup**, a floor/section/zone/rack can be tagged with one of the
  store's categories (`stock_locations.category_id`) — "this rack is Kids". Store-owned locations only.
- **Offline:** Dexie v11 `inventory_categories` + `stock_locations.category_id`; synced via the
  outbox (categories push before locations). Data layer: `src/features/inventory/categories.ts`.
- RLS: `has_store_permission` — read `inventory.read`, write `inventory.write`.
- **Demo (`/admin/demo`):** every demo store is seeded with categories by org type
  (`categories.demo.ts` — independent: Sarees / Dress Materials / Readymade / Blouse Pieces & Falls;
  chain: Men's / Women's / Kids Wear / Sarees / Home Furnishing; franchise (Bandrip): custom
  "Streetwear" + Accessories) via direct server insert, **before** the placement tree, so demo
  sections/zones carry a `category_id` (e.g. the "Sarees" section → Sarees).
- **E2E:** `e2e/org-setup-wizard.spec.ts` ticks two standard + one custom category on the new store,
  re-opens it, and verifies the rows sync to Supabase.

---

## Phase 2 — Product master + variants + SKU/barcode (DESIGNED)

Apparel is variant-heavy, so a **master → child** model:

- **`inventory`** (master, per-store product/style): `category_id`, name, hsn_code, unit, brand,
  design_no, fabric, `mrp_paise`, `selling_price_paise`, notes.
- **`inventory_items`** (child, variants): `inventory_id`, color, size, `sequence_no`, `sku`,
  `barcode`, `quantity`, price overrides. One SKU/barcode per variant (color × size).
- Money in **paise** (constitution §2.V).

### SKU
**SKU = Stock Keeping Unit** — the human-readable per-variant code. Composition
`STORE-CATEGORY-COLOR-SIZE-SEQ`:
- **Store code** ← `stores.store_code`; **Category** ← the store's category; **Color/Size** ←
  captured on the purchase invoice at intake; **Sequence** ← running number **per (store, category)**
  (`inventory_categories.next_sequence`).
- **SKU template** is **org-level** (one standard for all its stores): a `organizations.sku_template`
  jsonb — locked core segments (store·category·color·size·seq, preselected + disabled) + optional
  multi-select segments (brand / design_no / fabric / purchase_lot / season) + separator/order.
- **Offline sequence:** server-authoritative (assigned when the item reaches the server) to avoid
  cross-device collisions; an offline item shows "SKU pending" until sync.

### Barcode
Value = the **SKU string**, rendered as **Code128** (alphanumeric). One value serves all inputs:
Bluetooth scanner (keyboard wedge), Android camera scan (billing), or **manual typing** (the SKU is
human-readable) — so a sales agent is never blocked if a scanner fails.

### SKU is generated at **intake** (item creation), not the wizard's Stock-setup step
(that step is *locations/rooms*). Items are created day-to-day as stock is received.

---

## Later
- Stock on hand / movement (transfers, `stock_transfers`) — see `../reference/schema.md` §7.
- The **Assistant** (`assistant.md`) reads inventory (structured tool-use) + descriptions (RAG).
