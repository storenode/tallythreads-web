# M5 — Billing / POS, GST, receipt printing

**Status:** **Draft plan — not started** (drafted with the founder 2026-09-28; paused so stock can
first reach the stores — Inventory Phase 2G, live 2026-09-28). Waiting on the open questions below.
**Version:** 0.1.0
**Est:** 58h (constitution §5)
**Builds on:** `inventory.md` (items, SKUs, QR labels, store stock, `stock_movements`),
`../reference/roles-and-permissions.md` (`billing.write` / `billing.read`, already seeded),
`lib/gstCalc.ts`, `lib/mrpPricing.ts` (`gstInMrp`). Feeds M1d franchise settlement (gross sales) and
M6 GST reports.

---

## What already exists
- **Scan:** QR labels (`/s/{SKU}` link) + Code 128 + typed SKU; `skuFromScan` extracts the SKU.
- **Item lookup at the counter:** `store_stock(store)` — SKU, name, colour, size, **MRP**, qty per
  location, price-free of cost — cached per store for offline.
- **GST helpers:** `gstCalc.ts` (5% / 18% at ₹2,500 per piece, tax on top) and `gstInMrp` (tax inside
  a tax-inclusive MRP; ₹2,625 MRP boundary).
- **Rules:** billing must work offline (constitution §2.I); invoice numbers generated on the device,
  never a central counter (§6); money logic unit-tested first (§2.V); works at 375px (§7).
- The store **Billing** tab exists (`/ops/:storeId/billing`) as an empty page.

## Screens (planned)
1. **New bill:** scan → cart (qty ±, line discount; never above MRP) → bill discount (spread across
   lines — it can move an item 18% → 5%) → optional customer phone → payment (Cash / UPI / Card /
   split; change due) → **Complete bill**.
2. **Receipt / tax invoice** — direct print (like labels): store name, address, GSTIN, invoice no.,
   date, items, HSN, taxable value, CGST + SGST per rate, payment. 80 mm / 58 mm / A4.
3. **Today's bills:** search (invoice no. / phone), view, reprint, **void** (manager, same day, reason).
4. **Org view (read-only):** sales per store per day. GST reports / GSTR export = M6.

GST is **extracted from the tax-inclusive selling price**, never added on top (MRP is "incl. of all
taxes"); the slab follows the actual sale value per piece.

## Offline-first flow
Complete bill → invoice + lines + payments + one `sale` stock movement per line written to **Dexie
first**, pushed by the outbox when online. Invoice number built on the device (e.g.
`KDP2526A00042` = store code · FY · device letter · sequence). Stock may go negative when sold
offline — allowed and flagged for the manager, never blocked at the counter.

## Data model (proposed — not migrated)
- `sales_invoices` — org, store, `invoice_no` (unique per store + FY), device, cashier, customer
  phone / name, status (completed / voided + reason), MRP total, discount, taxable, CGST, SGST,
  round-off, total, `last_modified_at`, `deleted_at`.
- `sales_invoice_items` — invoice, item, SKU / name snapshot, colour, size, HSN, qty, MRP, discount,
  selling price, GST rate, taxable, CGST, SGST.
- `sales_payments` — invoice, mode (cash / UPI / card), amount, reference.
- `store_devices` — a short device letter per store (for invoice numbers).
- `stock_movements`: kinds `sale` / `return`; store staff with `billing.write` may insert `sale`
  movements for their own store.
- RLS: store staff read/write their store's bills; the org reads all its stores; no cost anywhere.
  A server trigger recomputes totals and **flags** mismatches (offline bills can't be refused later).

## Phases
| Phase | What | Est. |
|---|---|---|
| 5A | `lib/billingCalc.ts` + golden tests (inclusive GST split, per-piece slab, bill-discount allocation to the paisa, round-off, split payments / change) | ~4h |
| 5B | Migration + Dexie tables + sync + invoice numbering | ~8h |
| 5C | New-bill screen (scan → cart → pay → complete), offline | ~12h |
| 5D | Receipt / tax-invoice printing | ~6h |
| 5E | Today's bills, reprint, void; org sales view | ~6h |
| 5F | Offline e2e (bill offline → reconnect → on Supabase) + 375px | ~4h |
| 5G | Returns / exchanges (if not in v1) | — |

## Open questions (founder / CA)
1. **Invoice number:** ≤ 16 characters, unique per financial year (GST Rule 46) — is
   `{store code}{FY}{device letter}{sequence}` right? Restart each April?
2. **Discounts:** who may give them (sales staff up to X%, managers any)? Per line, per bill, both?
3. **Payments:** Cash / UPI / Card / split? Show the store's UPI QR?
4. **Customer:** phone / name optional? **B2B bills** (customer GSTIN) in v1?
5. **Printer** at the Bandrip counters: 80 mm thermal, 58 mm, A4?
6. **Returns / exchanges** in v1 or later?
7. **CA:** the ₹2,625 MRP boundary; regular GST vs composition scheme (composition shops can't
   collect GST on the bill); see `backlog.md` "GST across the chain".

## Changelog
- **v0.1.0 (2026-09-28)** — Draft plan from the founder discussion; not started.
