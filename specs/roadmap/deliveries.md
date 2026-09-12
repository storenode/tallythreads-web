# Deliveries (receiving) module

**Version:** 0.2.0 · **Status:** Built (2026-09-09) · **Module:** M4 Purchase-Trip follow-on

The receiving half of Purchase-Trip: turning a completed trip's supplier invoices (parcels)
into goods physically received, verified, and approved for inventory.

## Why this exists

A Purchase-Trip's supplier invoices are **parcels that arrive after the buyer completes the
trip** — over days, one manufacturer at a time. The trip itself is "done" (buying finished)
the moment the owner returns, but the goods keep landing. The original design only had a
per-invoice **Mark arrived** toggle on the trip-detail Invoices tab, shown **only while the
trip was `active`** — so once a trip was `completed` there was no way to record a delivery,
no verification, and nothing feeding inventory. This module fixes that gap with a dedicated
workspace.

## Model — receiving is per invoice (parcel)

Each `purchase_invoices` row = one supplier's parcel. Receiving is tracked on the invoice via
`receiving_status` moving through a **forward-only pipeline**:

```
pending ──In Transit──▶ in_transit ──Received──▶ received ──Verify Completed──▶ verified ──Approve──▶ ready_for_inventory
```
(the button at each stage advances to the next; those button labels are shown above the arrows.)

- **pending** — initial; parcel not yet dispatched. The detail page shows everything
  **disabled** with a single **In Transit** start action (only shown at this stage).
- **in_transit** — dispatched, on the way (still read-only).
- **received** — arrived; the **form becomes editable** for the manual goods check (stamps
  `arrived_at`).
- **verified** — every item checked; shown as a **read-only grid** (stamps `verified_at`).
- **ready_for_inventory** — approved, ready to become stock (stamps `approved_at`). **Terminal.**

**`ready_for_inventory` is the hand-off point to the future inventory module (M3 —
goods-received → godown → distribute → shelf).** It does **not** create stock yet; M3 will
consume ready parcels and create the stock records.

## Screens

### Deliveries list — `/org/:orgId/deliveries` (new left-nav item)
Org-level workspace (`src/features/purchaseTrips/pages/DeliveriesPage.tsx`). Lists **every
completed trip's invoices at invoice level** (one row per parcel):
- supplier name + current stage badge + `⚠ review` if flagged + a `checked/total` hint while
  in the received stage; parent trip title, invoice no, item count, total pieces.
- **Filters:** a status dropdown (`SingleSelect`: All / Pending / In Transit / Received /
  Verified / Ready for Inventory) + a supplier/trip text search.
- Rows sort most-actionable first (pending → … → ready_for_inventory), then newest-modified.
- **Each row is a link** — clicking opens the invoice's receiving detail (below). Advancing
  the stage happens there, not inline.

### Invoice receiving detail — `/org/:orgId/deliveries/:invoiceLocalId`
`DeliveryDetailPage.tsx`. Loads the invoice by `_localId` (falls back to server `id`), its
items, and the parent trip title.
- **Progress stepper** (`components/ReceivingStepper.tsx`) across the top: Pending → In
  Transit → Received → Verified → Ready for Inventory, completed steps filled, current
  highlighted.
- **Line items** — in the `received` stage this is an **editable manual check**: per item a
  **received quantity** + **comment** (`receiving_note`), autosave on blur, shortage/excess
  chip when received ≠ invoiced. In every other stage the items render as a **read-only grid**
  (Model / Invoiced / Received / Comment).
- **Invoice comments** — a whole-invoice `Textarea` persisted to `purchase_invoices.notes`,
  **editable at any stage** (a running log for future dealings with the supplier).
- **Advance control** (uses `receiving.ts`): one button showing the next action —
  `pending → In Transit`, `in_transit → Received`, `received → Verify Completed` (**disabled
  until every item has a received quantity** — a "N of M items checked" hint shows progress),
  `verified → Approve`, then `ready_for_inventory` terminal. Each advance writes through
  `updatePurchaseInvoice` and logs a `trip_activities` row on the parent trip (`arrived` for
  received; `note` for the others) with `ref_invoice_id`.

### Trip detail (Invoices tab)
No longer has a Mark-arrived toggle. It shows each invoice's stage as a **read-only badge**
and a "Received X / N · manage on Deliveries" readout. All receiving happens on the
Deliveries page.

### Store-staff Incoming Stock — `/ops/:storeId/incoming`
The price-free feed now shows each item's **receiving stage** (Pending / In Transit / Received
/ Verified / Ready for Inventory) instead of a bare arrived/in-transit flag. Still read-only, still no
cost/MRP/margin (via the `incoming_stock` view + `has_incoming_visibility()`).

## Data model

`purchase_invoices` (migrations `20260908030000_receiving_pipeline.sql`, then
`20260909010000_receiving_pending_stage.sql` renamed the stages):
- `receiving_status text not null default 'pending' check in ('pending','in_transit','received','verified','ready_for_inventory')`
- `verified_at timestamptz`, `approved_at timestamptz` (approved_at = the ready-for-inventory time)
- `arrived_at` (from `20260908000000`) reused as the received-at timestamp.
- Backfill: rows with `arrived_at` set → `receiving_status = 'received'`.
- `incoming_stock` view recreated to also expose `receiving_status`.
- Whole-invoice comments reuse the existing `notes` column (no new column).

`purchase_invoice_items` (migration `20260909000000_receiving_item_check.sql`) — the line-level
goods check:
- `received_quantity integer` (null = not yet checked; may differ from `quantity` = shortage/excess)
- `receiving_note text` — optional per-item comment.
- All items must have `received_quantity` set before the parent invoice can move
  `received → verified`.

Helper: `src/features/purchaseTrips/receiving.ts` — `RECEIVING_STAGES`, labels/badges/icons,
`nextReceivingStage`, `advanceLabel`, `advanceReceivingPatch` (pure, mirrors `lifecycle.ts`).

## Access

All receiving actions go through the `purchase_invoices` UPDATE RLS, i.e. **`trip.create`**
(org_owner / org_manager / platform_admin) — the same gate as the rest of Purchase-Trip. The
Deliveries nav item is hidden unless the member holds `trip.read`. Store staff keep only the
read-only price-free `incoming_stock` view.

## Non-goals (deferred)
- **No stock creation** — `ready_for_inventory` is the hand-off; the actual goods-received → godown →
  shelf flow is **M3/M1c**.
- **No separation-of-duties** — the same `trip.create` role receives, verifies, and approves.
  A distinct verifier/approver permission is a future enhancement.
- Forward-only — no "un-receive"/revert step (kept simple; revisit if needed).
