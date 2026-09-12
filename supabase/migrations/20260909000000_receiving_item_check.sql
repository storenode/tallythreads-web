-- M4 Deliveries: line-level goods check on receiving.
--
-- Advancing a parcel from `received` → `verified` (see 20260908030000_receiving_pipeline.sql)
-- now forces the owner to physically check each line: record the ACTUAL received quantity per
-- item (which may differ from the invoiced quantity — shortage/excess) plus an optional note.
-- These live on purchase_invoice_items; the whole-invoice comment reuses purchase_invoices.notes.

alter table purchase_invoice_items
  add column received_quantity integer
    check (received_quantity is null or received_quantity >= 0),
  add column receiving_note text;

comment on column purchase_invoice_items.received_quantity is
  'Actual quantity received at the store when checking this parcel (null = not yet checked). '
  'May differ from `quantity` (invoiced) — a shortage or excess. Set on the Deliveries invoice '
  'detail while the invoice is in the `received` stage; all items must be set to Verify.';
comment on column purchase_invoice_items.receiving_note is
  'Optional per-item note captured during the goods check (e.g. "2 pieces torn").';
