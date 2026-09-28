-- Phase 2G (specs/roadmap/inventory.md §11): how a dispatch travels.
-- One dispatch (stock_transfers row) = one shipment, so the details live on the transfer:
-- transport mode (courier / bus parcel / lorry / hand / other), carrier, AWB or LR number,
-- vehicle, contact, packages, expected arrival, freight + who pays it, and a photo of the
-- LR / courier receipt in the private `dispatch-receipts` bucket.
--
-- Money visibility: freight is org cost. Stores see it only when THEY pay it (to-pay on
-- delivery) — store_incoming leaves it out otherwise. Freight does not touch landed cost / MRP.

-- ── columns ──────────────────────────────────────────────────────────────────────────────
alter table public.stock_transfers
  add column transport_mode text
    check (transport_mode in ('courier', 'bus', 'lorry', 'hand', 'other')),
  add column carrier_name text check (char_length(carrier_name) <= 120),
  add column tracking_no text check (char_length(tracking_no) <= 60),
  add column vehicle_no text check (char_length(vehicle_no) <= 30),
  add column contact_name text check (char_length(contact_name) <= 120),
  add column contact_phone text check (char_length(contact_phone) <= 20),
  add column packages integer check (packages > 0),
  add column expected_at date,
  add column freight_paise bigint check (freight_paise >= 0),
  add column freight_paid_by text check (freight_paid_by in ('org', 'store')),
  add column receipt_path text check (char_length(receipt_path) <= 300),
  add constraint stock_transfers_freight_needs_payer
    check (freight_paise is null or freight_paid_by is not null);

-- ── shipment writer (internal) ───────────────────────────────────────────────────────────
-- Validates a shipment jsonb and writes it onto the transfer (full replace of the shipment
-- fields). Called by dispatch_stock and update_transfer_shipment only; not API-callable.
-- Keys: transport_mode, carrier_name, tracking_no, vehicle_no, contact_name, contact_phone,
-- packages, expected_at (YYYY-MM-DD), freight_paise, freight_paid_by, receipt_path.
create or replace function public.apply_transfer_shipment(p_transfer_id uuid, p_s jsonb)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_t stock_transfers;
  v_mode text := nullif(trim(p_s ->> 'transport_mode'), '');
  v_tracking text := nullif(trim(p_s ->> 'tracking_no'), '');
  v_freight bigint := nullif(trim(p_s ->> 'freight_paise'), '')::bigint;
  v_payer text := nullif(trim(p_s ->> 'freight_paid_by'), '');
  v_receipt text := nullif(trim(p_s ->> 'receipt_path'), '');
begin
  if p_s is null or jsonb_typeof(p_s) <> 'object' then return; end if;
  select * into v_t from stock_transfers where id = p_transfer_id;

  if v_mode is null then
    raise exception 'Choose how the stock travels (courier, bus, lorry, hand or other)';
  end if;
  if v_mode not in ('courier', 'bus', 'lorry', 'hand', 'other') then
    raise exception 'Unknown transport mode %', v_mode;
  end if;
  if v_mode in ('courier', 'bus', 'lorry') and v_tracking is null then
    raise exception 'Add the % number',
      case v_mode when 'courier' then 'AWB / docket' else 'LR / booking' end;
  end if;
  if v_freight is not null and v_payer is null then
    raise exception 'Say who pays the freight — the organization or the store';
  end if;
  if v_receipt is not null
     and v_receipt not like v_t.organization_id::text || '/' || v_t.id::text || '/%' then
    raise exception 'Receipt photo is not stored under this dispatch';
  end if;

  update stock_transfers set
    transport_mode = v_mode,
    carrier_name = nullif(trim(p_s ->> 'carrier_name'), ''),
    tracking_no = v_tracking,
    vehicle_no = nullif(upper(trim(p_s ->> 'vehicle_no')), ''),
    contact_name = nullif(trim(p_s ->> 'contact_name'), ''),
    contact_phone = nullif(trim(p_s ->> 'contact_phone'), ''),
    packages = nullif(trim(p_s ->> 'packages'), '')::integer,
    expected_at = nullif(trim(p_s ->> 'expected_at'), '')::date,
    freight_paise = v_freight,
    freight_paid_by = v_payer,
    receipt_path = v_receipt,
    last_modified_at = now()
  where id = p_transfer_id;
end;
$$;

-- ── dispatch (adds p_shipment) ───────────────────────────────────────────────────────────
-- Same as 20260927222247_inventory_distribution, plus: the optional shipment, applied to the
-- new transfer before its lines (a bad shipment rolls the whole dispatch back); and a partial
-- UNA reissue now reduces the UNA item's quantity (see below).
drop function public.dispatch_stock(uuid, jsonb, text);

create function public.dispatch_stock(
  p_store_id uuid, p_lines jsonb, p_note text default null, p_shipment jsonb default null)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_org uuid;
  v_transfer uuid;
  v_line jsonb;
  v_item inventory_items;
  v_new inventory_items;
  v_qty integer;
  v_at_org integer;
  v_category uuid;
  v_reissued jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  select organization_id into v_org from stores where id = p_store_id and deleted_at is null;
  if v_org is null then raise exception 'Store not found'; end if;
  if not (is_platform_admin() or has_org_permission(v_org, 'inventory.manage')) then
    raise exception 'Not authorized to dispatch stock for this organization';
  end if;
  perform set_config('tallythreads.inventory_rpc', 'on', true);

  insert into stock_transfers (organization_id, to_store_id, note, dispatched_by)
  values (v_org, p_store_id, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_transfer;

  perform apply_transfer_shipment(v_transfer, p_shipment);

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := (v_line ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select * into v_item from inventory_items
    where id = (v_line ->> 'item_id')::uuid and organization_id = v_org and deleted_at is null
    for update;
    if v_item.id is null then raise exception 'Item not found'; end if;
    if v_item.status <> 'finalized' then
      raise exception '% is not finalized', coalesce(v_item.sku, v_item.name);
    end if;
    if v_item.store_id is not null and v_item.store_id <> p_store_id then
      raise exception '% is allocated to another store', v_item.sku;
    end if;

    select coalesce(sum(quantity), 0) into v_at_org from stock_levels
    where item_id = v_item.id and loc_kind = 'org';
    if v_at_org < v_qty then
      raise exception 'Only % of % are at the organization', v_at_org, v_item.sku;
    end if;

    if v_item.store_id is null then
      -- Re-issue UNA stock with this store's SKU.
      select c.id into v_category from inventory_categories c
      where c.store_id = p_store_id and c.code = v_item.category_code and c.deleted_at is null;
      if v_category is null then
        raise exception 'The store has no category with code % — add it before dispatching %',
          v_item.category_code, v_item.sku;
      end if;

      insert into inventory_items (
        organization_id, source_invoice_item_id, store_id, category_id, category_code,
        name, color, size, quantity, mrp_paise, landed_unit_cost_paise, status, sku,
        finalized_at, created_by)
      values (
        v_org, v_item.source_invoice_item_id, p_store_id, v_category, v_item.category_code,
        v_item.name, v_item.color, v_item.size, v_qty, v_item.mrp_paise,
        v_item.landed_unit_cost_paise, 'finalized',
        next_inventory_sku(v_org, p_store_id, v_item.category_code, v_item.color, v_item.size),
        now(), auth.uid())
      returning * into v_new;

      insert into stock_movements (organization_id, item_id, quantity, kind, from_kind, member_id, reason)
      values (v_org, v_item.id, v_qty, 'reissue', 'org', auth.uid(), 'reissued as ' || v_new.sku);
      insert into stock_movements (organization_id, item_id, quantity, kind, to_kind, member_id, reason)
      values (v_org, v_new.id, v_qty, 'reissue', 'org', auth.uid(), 'reissued from ' || v_item.sku);

      if v_at_org = v_qty then
        update inventory_items
        set status = 'retired', replaced_by_item_id = v_new.id, last_modified_at = now()
        where id = v_item.id;
      else
        -- Partial reissue (new in 2G): the pieces now carry the store SKU, so the UNA item
        -- shrinks by them. Otherwise the Catalogue line counts them twice ("35 of 25").
        update inventory_items
        set quantity = quantity - v_qty, last_modified_at = now()
        where id = v_item.id;
      end if;

      v_reissued := v_reissued || jsonb_build_object(
        'from_sku', v_item.sku, 'item_id', v_new.id, 'sku', v_new.sku, 'qty', v_qty);
      v_item := v_new;
    end if;

    insert into stock_transfer_items (organization_id, transfer_id, item_id, qty_sent)
    values (v_org, v_transfer, v_item.id, v_qty);
    insert into stock_movements (
      organization_id, item_id, quantity, kind, from_kind, to_kind, to_store_id, transfer_id, member_id)
    values (v_org, v_item.id, v_qty, 'dispatch', 'org', 'transit', p_store_id, v_transfer, auth.uid());
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Nothing to dispatch'; end if;
  perform set_config('tallythreads.inventory_rpc', 'off', true);
  return jsonb_build_object('transfer_id', v_transfer, 'reissued', v_reissued);
end;
$$;

-- ── item stages & lock rules (founder, 2026-09-28) ───────────────────────────────────────
-- No Finalize button: an item gets its SKU on first use ("Generate barcode" / Print / Dispatch).
-- Stages and what clients may change (the RPC path — session flag — is exempt):
--   1. draft                          everything (existing guard)
--   2. SKU, no labels printed         name + MRP; SKU fields / qty need reset_item_sku() first
--                                     (qty was booked into org stock by the `finalize` movement)
--   3. labels printed (> 0)           frozen — stickers are on the packets; unlock_item_labels()
--                                     (with a reason) takes it back to stage 2
--   4. dispatched (any piece)         frozen for good
-- `labels_printed` itself stays writable (the "Printed OK? → Mark done" count, reprints).
create or replace function public.inventory_items_lock_rules()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_label text := coalesce(old.sku, old.name);
begin
  if coalesce(current_setting('tallythreads.inventory_rpc', true), '') = 'on' then
    return new;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if new.name is distinct from old.name
     or new.mrp_paise is distinct from old.mrp_paise
     or new.quantity is distinct from old.quantity
     or new.deleted_at is distinct from old.deleted_at then
    if exists (select 1 from stock_movements m
               where m.item_id = old.id and m.kind = 'dispatch' and m.deleted_at is null) then
      raise exception '% has been dispatched — it can no longer be changed', v_label;
    end if;
    if old.labels_printed > 0 then
      raise exception '% has printed labels — unlock it (with a reason) to correct it', v_label;
    end if;
    if new.quantity is distinct from old.quantity or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Reset the barcode of % before changing its quantity or removing it', v_label;
    end if;
  end if;
  return new;
end;
$$;

create trigger inventory_items_lock_rules
  before update on public.inventory_items
  for each row execute function public.inventory_items_lock_rules();

-- Stage 2 → 1: cancel an unprinted, undispatched SKU so its SKU fields / qty can change. The
-- `finalize` stock is reversed with an `adjust` movement (the log is append-only) and the item
-- goes back to draft. The SKU number is not reused — the next barcode gets the next number.
create or replace function public.reset_item_sku(p_item_id uuid)
returns setof public.inventory_items
language plpgsql security definer set search_path to 'public' as $$
declare
  v_item inventory_items;
  v_at_org integer;
begin
  select * into v_item from inventory_items where id = p_item_id and deleted_at is null for update;
  if v_item.id is null then raise exception 'Item not found'; end if;
  if not (is_platform_admin() or has_org_permission(v_item.organization_id, 'inventory.manage')) then
    raise exception 'Not authorized to change this item';
  end if;
  if v_item.status <> 'finalized' then
    raise exception '% has no barcode to reset', v_item.name;
  end if;
  if v_item.labels_printed > 0 then
    raise exception '% has printed labels — unlock it first', v_item.sku;
  end if;
  if exists (select 1 from stock_movements m
             where m.item_id = v_item.id and m.kind <> 'finalize' and m.deleted_at is null) then
    raise exception '% has already moved (dispatch / reissue) — its barcode can''t be reset', v_item.sku;
  end if;

  select coalesce(sum(quantity), 0) into v_at_org from stock_levels
  where item_id = v_item.id and loc_kind = 'org';
  perform set_config('tallythreads.inventory_rpc', 'on', true);
  if v_at_org > 0 then
    insert into stock_movements (organization_id, item_id, quantity, kind, from_kind, member_id, reason)
    values (v_item.organization_id, v_item.id, v_at_org, 'adjust', 'org', auth.uid(),
            'barcode reset: ' || v_item.sku || ' cancelled');
  end if;
  update inventory_items
  set status = 'draft', sku = null, finalized_at = null, labels_printed = 0, last_modified_at = now()
  where id = v_item.id
  returning * into v_item;
  perform set_config('tallythreads.inventory_rpc', 'off', true);
  return next v_item;
end;
$$;

-- Stage 3 → 2: the owner/manager unlocks a printed (not dispatched) item to correct a mistake.
-- The stickers must be removed; the reason is kept for the record.
create table public.inventory_item_unlocks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  item_id          uuid not null references public.inventory_items(id) on delete cascade,
  sku              text,
  labels_printed   integer not null,
  reason           text not null check (char_length(trim(reason)) between 1 and 200),
  member_id        uuid references public.members(id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.inventory_item_unlocks is
  'Audit of printed items unlocked for correction (stickers discarded). Written only by unlock_item_labels().';
create index inventory_item_unlocks_item_idx on public.inventory_item_unlocks (item_id);
alter table public.inventory_item_unlocks enable row level security;
create policy "org reads item unlocks" on public.inventory_item_unlocks
  for select to authenticated
  using (is_platform_admin() or has_org_permission(organization_id, 'inventory.manage'));

create or replace function public.unlock_item_labels(p_item_id uuid, p_reason text)
returns setof public.inventory_items
language plpgsql security definer set search_path to 'public' as $$
declare
  v_item inventory_items;
begin
  select * into v_item from inventory_items where id = p_item_id and deleted_at is null for update;
  if v_item.id is null then raise exception 'Item not found'; end if;
  if not (is_platform_admin() or has_org_permission(v_item.organization_id, 'inventory.manage')) then
    raise exception 'Not authorized to unlock this item';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why the item is being unlocked';
  end if;
  if v_item.status <> 'finalized' or v_item.labels_printed = 0 then
    raise exception '% has no printed labels to unlock', coalesce(v_item.sku, v_item.name);
  end if;
  if exists (select 1 from stock_movements m
             where m.item_id = v_item.id and m.kind = 'dispatch' and m.deleted_at is null) then
    raise exception '% has been dispatched — it can no longer be changed', v_item.sku;
  end if;

  insert into inventory_item_unlocks (organization_id, item_id, sku, labels_printed, reason, member_id)
  values (v_item.organization_id, v_item.id, v_item.sku, v_item.labels_printed,
          left(trim(p_reason), 200), auth.uid());
  perform set_config('tallythreads.inventory_rpc', 'on', true);
  update inventory_items set labels_printed = 0, last_modified_at = now()
  where id = v_item.id
  returning * into v_item;
  perform set_config('tallythreads.inventory_rpc', 'off', true);
  return next v_item;
end;
$$;

-- ── edit shipment after dispatch ─────────────────────────────────────────────────────────
-- The AWB / LR number often arrives after booking, and the receipt photo is uploaded once the
-- transfer id exists. Editable while in transit; locked once the store has received it.
create or replace function public.update_transfer_shipment(p_transfer_id uuid, p_shipment jsonb)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_t stock_transfers;
begin
  select * into v_t from stock_transfers where id = p_transfer_id and deleted_at is null for update;
  if v_t.id is null then raise exception 'Dispatch not found'; end if;
  if not (is_platform_admin() or has_org_permission(v_t.organization_id, 'inventory.manage')) then
    raise exception 'Not authorized to edit this dispatch';
  end if;
  if v_t.status <> 'dispatched' then
    raise exception 'This dispatch was already received — its shipment details are locked';
  end if;
  if p_shipment is null or jsonb_typeof(p_shipment) <> 'object' then
    raise exception 'Shipment details are missing';
  end if;
  perform apply_transfer_shipment(p_transfer_id, p_shipment);
end;
$$;

-- ── store feed (adds the shipment; freight only when the store pays) ─────────────────────
create or replace function public.store_incoming(p_store_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(t order by t ->> 'dispatched_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', st.id, 'status', st.status, 'note', st.note, 'dispatched_at', st.dispatched_at,
      'received_at', st.received_at,
      'shipment', jsonb_build_object(
        'transport_mode', st.transport_mode, 'carrier_name', st.carrier_name,
        'tracking_no', st.tracking_no, 'vehicle_no', st.vehicle_no,
        'contact_name', st.contact_name, 'contact_phone', st.contact_phone,
        'packages', st.packages, 'expected_at', st.expected_at,
        'freight_paid_by', st.freight_paid_by,
        'freight_paise', case when st.freight_paid_by = 'store' then st.freight_paise end,
        'receipt_path', st.receipt_path),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'item_id', i.id, 'sku', i.sku, 'name', i.name, 'color', i.color, 'size', i.size,
                  'mrp_paise', i.mrp_paise, 'qty_sent', ti.qty_sent, 'qty_received', ti.qty_received)
                  order by i.name, i.color, i.size), '[]'::jsonb)
                from stock_transfer_items ti join inventory_items i on i.id = ti.item_id
                where ti.transfer_id = st.id and ti.deleted_at is null)) as t
    from stock_transfers st
    where st.to_store_id = p_store_id and st.deleted_at is null
      and (st.status = 'dispatched' or st.received_at > now() - interval '7 days')
      and (is_platform_admin() or has_store_permission(p_store_id, 'inventory.read'))
  ) x;
$$;

-- ── receipt photo bucket ─────────────────────────────────────────────────────────────────
-- Path `{organization_id}/{transfer_id}/{uuid}.jpg`. The org uploads / replaces; the receiving
-- store can view it (to match the LR slip when the parcel arrives).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispatch-receipts', 'dispatch-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Safe path parsing (no uuid cast errors on odd names).
create or replace function public.can_read_dispatch_receipt(p_name text)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from stock_transfers t
    where split_part(p_name, '/', 1) ~* '^[0-9a-f-]{36}$'
      and split_part(p_name, '/', 2) ~* '^[0-9a-f-]{36}$'
      and t.id = split_part(p_name, '/', 2)::uuid
      and t.organization_id = split_part(p_name, '/', 1)::uuid
      and t.deleted_at is null
      and (is_platform_admin()
           or has_org_permission(t.organization_id, 'inventory.manage')
           or has_store_permission(t.to_store_id, 'inventory.read')));
$$;

create or replace function public.can_write_dispatch_receipt(p_name text)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from stock_transfers t
    where split_part(p_name, '/', 1) ~* '^[0-9a-f-]{36}$'
      and split_part(p_name, '/', 2) ~* '^[0-9a-f-]{36}$'
      and t.id = split_part(p_name, '/', 2)::uuid
      and t.organization_id = split_part(p_name, '/', 1)::uuid
      and t.deleted_at is null
      and t.status = 'dispatched'
      and (is_platform_admin() or has_org_permission(t.organization_id, 'inventory.manage')));
$$;

create policy "org uploads dispatch receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dispatch-receipts' and public.can_write_dispatch_receipt(name));

create policy "org removes dispatch receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dispatch-receipts' and public.can_write_dispatch_receipt(name));

create policy "org and receiving store read dispatch receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'dispatch-receipts' and public.can_read_dispatch_receipt(name));

-- ── org hard delete also removes dispatch receipts ───────────────────────────────────────
-- Live definition of hard_delete_organization, with 'dispatch-receipts' added to the storage
-- clean-up (receipts may carry contact names / phone numbers).
CREATE OR REPLACE FUNCTION public.hard_delete_organization(org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_name text;
  v_store_ids uuid[];
  v_warehouse_ids uuid[];
  v_franchise_group_ids uuid[];
  v_trip_ids uuid[];
  v_member_ids uuid[];
  v_channels_deleted int;
  v_franchise_memberships_deleted int;
  v_settlement_rules_deleted int;
  v_access_grants_deleted int;
  v_store_invitations_deleted int;
  v_memberships_deleted int;
  v_franchise_groups_deleted int;
  v_stores_deleted int;
  v_demo_scenarios_deleted int;
  v_purchase_trips_deleted int;
  v_stock_locations_deleted int := 0;
  v_warehouse_stores_deleted int := 0;
  v_warehouses_deleted int := 0;
  v_members_deleted int := 0;
  v_devices_deleted int := 0;
  v_storage_deleted int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can hard-delete an organization';
  end if;

  select name into v_org_name from organizations where id = org_id;
  if v_org_name is null then
    raise exception 'Organization % not found', org_id;
  end if;

  select coalesce(array_agg(id), '{}') into v_store_ids
    from stores where organization_id = org_id;
  select coalesce(array_agg(id), '{}') into v_warehouse_ids
    from warehouses where organization_id = org_id;
  select coalesce(array_agg(id), '{}') into v_franchise_group_ids
    from franchise_groups where franchisor_org_id = org_id;
  select coalesce(array_agg(id), '{}') into v_trip_ids
    from purchase_trips where organization_id = org_id;
  select coalesce(array_agg(distinct member_id), '{}') into v_member_ids
    from memberships where organization_id = org_id or store_id = any(v_store_ids);

  delete from channels where store_id = any(v_store_ids);
  get diagnostics v_channels_deleted = row_count;

  delete from franchise_memberships
    where store_id = any(v_store_ids) or franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_franchise_memberships_deleted = row_count;

  delete from settlement_rules where franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_settlement_rules_deleted = row_count;

  delete from access_grants
    where (scope_type = 'organization' and scope_id = org_id)
       or (scope_type = 'store' and scope_id = any(v_store_ids));
  get diagnostics v_access_grants_deleted = row_count;

  delete from store_invitations
    where organization_id = org_id or store_id = any(v_store_ids);
  get diagnostics v_store_invitations_deleted = row_count;

  delete from memberships
    where organization_id = org_id or store_id = any(v_store_ids);
  get diagnostics v_memberships_deleted = row_count;

  delete from demo_scenarios where organization_id = org_id;
  get diagnostics v_demo_scenarios_deleted = row_count;

  delete from purchase_invoice_items
    where invoice_id in (select id from purchase_invoices where trip_id = any(v_trip_ids));
  delete from trip_activities where trip_id = any(v_trip_ids);
  delete from trip_expenses where trip_id = any(v_trip_ids);
  delete from purchase_invoices where trip_id = any(v_trip_ids);
  delete from purchase_trips where organization_id = org_id;
  get diagnostics v_purchase_trips_deleted = row_count;

  delete from stock_locations
    where store_id = any(v_store_ids) or warehouse_id = any(v_warehouse_ids);
  get diagnostics v_stock_locations_deleted = row_count;

  delete from warehouse_stores where warehouse_id = any(v_warehouse_ids);
  get diagnostics v_warehouse_stores_deleted = row_count;

  delete from warehouses where organization_id = org_id;
  get diagnostics v_warehouses_deleted = row_count;

  delete from franchise_groups where franchisor_org_id = org_id;
  get diagnostics v_franchise_groups_deleted = row_count;

  delete from stores where organization_id = org_id;
  get diagnostics v_stores_deleted = row_count;

  delete from organizations where id = org_id;

  delete from devices d
   where d.member_id = any(v_member_ids)
     and not exists (select 1 from memberships x where x.member_id = d.member_id)
     and not exists (select 1 from access_grants x where x.grantee_member_id = d.member_id or x.granted_by = d.member_id)
     and not exists (select 1 from store_invitations x where x.invited_by = d.member_id)
     and not exists (select 1 from qa_test_cases x where x.last_run_by = d.member_id)
     and not exists (select 1 from purchase_trips x where x.created_by = d.member_id)
     and not exists (select 1 from trip_activities x where x.member_id = d.member_id)
     and not exists (select 1 from organizations x where x.primary_contact_member_id = d.member_id or x.onboarded_by = d.member_id);
  get diagnostics v_devices_deleted = row_count;

  delete from members mm
   where mm.id = any(v_member_ids)
     and not exists (select 1 from memberships x where x.member_id = mm.id)
     and not exists (select 1 from access_grants x where x.grantee_member_id = mm.id or x.granted_by = mm.id)
     and not exists (select 1 from store_invitations x where x.invited_by = mm.id)
     and not exists (select 1 from qa_test_cases x where x.last_run_by = mm.id)
     and not exists (select 1 from purchase_trips x where x.created_by = mm.id)
     and not exists (select 1 from trip_activities x where x.member_id = mm.id)
     and not exists (select 1 from organizations x where x.primary_contact_member_id = mm.id or x.onboarded_by = mm.id)
     and not exists (select 1 from devices x where x.member_id = mm.id);
  get diagnostics v_members_deleted = row_count;

  begin
    delete from storage.objects
     where (bucket_id in ('receipts', 'org-logos', 'dispatch-receipts')
            and (storage.foldername(name))[1] = org_id::text)
        or (bucket_id = 'store-logos'
            and (storage.foldername(name))[1] = any(v_store_ids::text[]));
    get diagnostics v_storage_deleted = row_count;
  exception when others then
    v_storage_deleted := -1;
  end;

  return jsonb_build_object(
    'organization_name', v_org_name,
    'stores_deleted', v_stores_deleted,
    'channels_deleted', v_channels_deleted,
    'memberships_deleted', v_memberships_deleted,
    'store_invitations_deleted', v_store_invitations_deleted,
    'access_grants_deleted', v_access_grants_deleted,
    'franchise_groups_deleted', v_franchise_groups_deleted,
    'franchise_memberships_deleted', v_franchise_memberships_deleted,
    'settlement_rules_deleted', v_settlement_rules_deleted,
    'demo_scenarios_deleted', v_demo_scenarios_deleted,
    'purchase_trips_deleted', v_purchase_trips_deleted,
    'stock_locations_deleted', v_stock_locations_deleted,
    'warehouse_stores_deleted', v_warehouse_stores_deleted,
    'warehouses_deleted', v_warehouses_deleted,
    'members_deleted', v_members_deleted,
    'devices_deleted', v_devices_deleted,
    'storage_objects_deleted', v_storage_deleted
  );
end;
$function$;

-- ── API exposure ─────────────────────────────────────────────────────────────────────────
revoke execute on function public.dispatch_stock(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.dispatch_stock(uuid, jsonb, text, jsonb) to authenticated;
revoke execute on function public.update_transfer_shipment(uuid, jsonb) from public, anon;
grant execute on function public.update_transfer_shipment(uuid, jsonb) to authenticated;
-- Internal: only the RPCs above and the storage policies call these.
revoke execute on function public.apply_transfer_shipment(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.inventory_items_lock_rules() from public, anon, authenticated;
revoke execute on function public.reset_item_sku(uuid) from public, anon;
grant execute on function public.reset_item_sku(uuid) to authenticated;
revoke execute on function public.unlock_item_labels(uuid, text) from public, anon;
grant execute on function public.unlock_item_labels(uuid, text) to authenticated;
revoke execute on function public.can_read_dispatch_receipt(text) from public, anon;
revoke execute on function public.can_write_dispatch_receipt(text) from public, anon;
grant execute on function public.can_read_dispatch_receipt(text) to authenticated;
grant execute on function public.can_write_dispatch_receipt(text) to authenticated;
