-- M4 Purchase-Trip: per-invoice receiving pipeline (the Deliveries module).
--
-- A trip's supplier invoices are parcels that arrive AFTER the buyer completes the trip —
-- over days, one manufacturer at a time. The single `arrived_at` boolean-ish timestamp
-- (20260908000000) couldn't express the real workflow the owner runs on delivery:
--   in_transit → received → verified → approved
-- `approved` is the hand-off point to the future inventory module (M3) — approving marks a
-- parcel ready to become stock; M3 does the actual stock creation (not built here).
--
-- Modelled on purchase_invoices (invoice = parcel). `arrived_at` is retained as the
-- received-at timestamp (received ⇔ arrived_at set), so no data is lost.

alter table purchase_invoices
  add column receiving_status text not null default 'in_transit'
    check (receiving_status in ('in_transit', 'received', 'verified', 'approved')),
  add column verified_at timestamptz,
  add column approved_at timestamptz;

comment on column purchase_invoices.receiving_status is
  'Delivery/receiving stage of this parcel: in_transit → received → verified → approved. '
  'approved is the hand-off to the M3 inventory module (which creates the actual stock). '
  'Managed on the Deliveries page for completed trips; arrived_at is the received-at time.';

-- Existing arrived parcels are "received".
update purchase_invoices set receiving_status = 'received' where arrived_at is not null;

-- Surface the stage in the price-free store feed. Recreate the view appending
-- receiving_status LAST (create-or-replace can only add trailing columns). Everything
-- else — columns, joins, filters — unchanged; still NO cost/MRP/margin/budget.
create or replace view public.incoming_stock
with (security_invoker = false) as
  select
    t.id            as trip_id,
    t.organization_id,
    t.status,
    t.title         as trip_title,
    t.end_date      as expected_by,
    i.id            as item_id,
    i.description,
    i.quantity,
    pi.arrived_at   as arrived_at,
    pi.receiving_status as receiving_status
  from purchase_trips t
  join purchase_invoices pi
    on pi.trip_id = t.id and pi.deleted_at is null
  join purchase_invoice_items i
    on i.invoice_id = pi.id and i.deleted_at is null
  where t.deleted_at is null
    and t.status in ('active', 'completed')
    and public.has_incoming_visibility(t.organization_id);

grant select on public.incoming_stock to authenticated;
