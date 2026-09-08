-- M4 Purchase-Trip: cancel state + per-invoice arrival.
--
-- 1. A trip can now be `cancelled` (called off from planning or active). Terminal like
--    `completed`; recovery is via "Clone trip", not reopen. A `cancelled` journey-log
--    activity records who/when.
-- 2. Arrival is modelled per SUPPLIER INVOICE (a trip has many invoices from different
--    manufacturers; each is parcelled to the store and arrives separately). An arrived
--    invoice is the input to the future inventory module (M3/M1c). Tracked as a nullable
--    `arrived_at` timestamp (set = arrived, null = in transit), toggleable.
-- 3. The price-free `incoming_stock` view exposes `arrived_at` so store staff can tell
--    arrived from in-transit — still NO cost/MRP/margin/budget columns.

-- 1. Trip status: add 'cancelled' to the CHECK.
alter table purchase_trips drop constraint purchase_trips_status_check;
alter table purchase_trips add constraint purchase_trips_status_check
  check (status in ('planning', 'active', 'completed', 'cancelled'));

-- 2. Activity kind: add 'cancelled' ('arrived' already allowed).
alter table trip_activities drop constraint trip_activities_kind_check;
alter table trip_activities add constraint trip_activities_kind_check
  check (kind in ('note', 'started', 'completed', 'arrived',
                  'expense', 'invoice', 'receipt_scan', 'cancelled'));

-- 3. Per-invoice arrival timestamp (nullable; no default = "in transit").
alter table purchase_invoices add column arrived_at timestamptz;

comment on column purchase_invoices.arrived_at is
  'When this supplier invoice''s parcel physically arrived at the store (null = in '
  'transit). Set/cleared by the owner during the trip''s active/completed phase; an '
  'arrived invoice is the input to the future inventory module (M3/M1c).';

-- 4. Surface arrival in the price-free incoming feed. Recreate the view adding
--    pi.arrived_at; everything else (columns, joins, filters) is unchanged. Still NO
--    cost / landed / mrp / margin / budget / expense columns.
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
    -- appended last: `create or replace view` can only add columns at the end.
    pi.arrived_at   as arrived_at
  from purchase_trips t
  join purchase_invoices pi
    on pi.trip_id = t.id and pi.deleted_at is null
  join purchase_invoice_items i
    on i.invoice_id = pi.id and i.deleted_at is null
  where t.deleted_at is null
    and t.status in ('active', 'completed')
    and public.has_incoming_visibility(t.organization_id);

grant select on public.incoming_stock to authenticated;
