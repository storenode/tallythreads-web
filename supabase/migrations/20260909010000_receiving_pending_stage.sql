-- M4 Deliveries: rework the receiving pipeline to 5 explicit stages with the founder's words.
--
--   pending → in_transit → received → verified → ready_for_inventory
--
-- `pending` is the new initial state (parcel not yet dispatched; the detail page shows
-- everything disabled with a single "In Transit" start action). `ready_for_inventory` replaces
-- `approved` as the terminal hand-off to M3. Was: in_transit(default)→received→verified→approved
-- (20260908030000). The default becomes `pending`; existing un-started `in_transit` rows (the
-- old default) map to `pending`, and `approved` rows to `ready_for_inventory`.

-- 1. Relax the CHECK so we can remap values, then set the new default.
alter table purchase_invoices drop constraint purchase_invoices_receiving_status_check;
alter table purchase_invoices alter column receiving_status set default 'pending';

-- 2. Remap existing rows.
update purchase_invoices set receiving_status = 'ready_for_inventory'
  where receiving_status = 'approved';
update purchase_invoices set receiving_status = 'pending'
  where receiving_status = 'in_transit';

-- 3. Re-add the CHECK with the new value set.
alter table purchase_invoices add constraint purchase_invoices_receiving_status_check
  check (receiving_status in
    ('pending', 'in_transit', 'received', 'verified', 'ready_for_inventory'));

comment on column purchase_invoices.receiving_status is
  'Receiving stage of this parcel: pending → in_transit → received → verified → '
  'ready_for_inventory. Managed on the Deliveries invoice detail; ready_for_inventory is the '
  'hand-off to the M3 inventory module (which creates the actual stock).';
