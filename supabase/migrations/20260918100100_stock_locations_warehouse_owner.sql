-- Warehouses, part 2: let the Stock Placement tree belong to a warehouse as well as a store.
-- See specs/roadmap/warehouses.md §2.3. One tree reused — no second placement system.
--
-- A stock_locations row is now owned by EXACTLY ONE of (store_id, warehouse_id). Store-owned
-- rows keep the existing store-scoped RLS; warehouse-owned rows use org-scoped RLS against the
-- warehouse's organization, plus a cross-link path so a store's inventory staff can READ (pick)
-- locations of a warehouse their store is attached to via warehouse_stores.

-- 1. Ownership columns: relax store_id, add warehouse_id, enforce exactly-one-owner.
alter table public.stock_locations alter column store_id drop not null;
alter table public.stock_locations
  add column warehouse_id uuid references public.warehouses(id) on delete cascade;

alter table public.stock_locations
  add constraint stock_locations_one_owner
  check ((store_id is not null) <> (warehouse_id is not null));

comment on column public.stock_locations.warehouse_id is
  'Owning warehouse when this location lives inside a warehouse/stock room (exactly one of '
  'store_id / warehouse_id is set — stock_locations_one_owner). See specs/roadmap/warehouses.md.';

create index stock_locations_warehouse_idx
  on public.stock_locations (warehouse_id) where deleted_at is null;

-- 2. Widen sibling-code uniqueness to be per-OWNER (store or warehouse), not per-store.
--    owner = coalesce(store_id, warehouse_id); parent null folded to a sentinel as before.
drop index if exists public.stock_locations_sibling_code_uniq;
create unique index stock_locations_sibling_code_uniq on public.stock_locations
  (coalesce(store_id, warehouse_id),
   coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
   lower(code))
  where deleted_at is null;

-- 3. Dual-scope RLS. Drop the store-only policies and recreate with a store branch AND a
--    warehouse branch. The one-owner check guarantees exactly one branch is live per row.
drop policy if exists "inventory.read can read stock_locations"      on public.stock_locations;
drop policy if exists "store.edit can insert stock_locations"        on public.stock_locations;
drop policy if exists "store.edit can update stock_locations"        on public.stock_locations;
-- (the platform-admin delete policy is unchanged and kept.)

-- READ:
--   • store-owned  -> inventory.read on that store (unchanged behaviour).
--   • warehouse-owned -> inventory.read at the warehouse's org (owner/manager), OR the member
--     has inventory.read on ANY store attached to the warehouse (so store staff can pick godown
--     locations their store draws from).
create policy "inventory.read can read stock_locations" on public.stock_locations
  for select to authenticated
  using (
    public.is_platform_admin()
    or (store_id is not null and public.has_store_permission(store_id, 'inventory.read'))
    or (warehouse_id is not null and (
          public.has_org_permission(
            (select w.organization_id from public.warehouses w where w.id = warehouse_id),
            'inventory.read')
          or exists (
            select 1 from public.warehouse_stores ws
            where ws.warehouse_id = stock_locations.warehouse_id
              and ws.deleted_at is null
              and public.has_store_permission(ws.store_id, 'inventory.read')
          )
       ))
  );

-- DESIGN (insert/update, incl. soft-delete):
--   • store-owned  -> store.edit on that store (unchanged).
--   • warehouse-owned -> store.edit at the warehouse's org (owner/manager).
create policy "store.edit can insert stock_locations" on public.stock_locations
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or (store_id is not null and public.has_store_permission(store_id, 'store.edit'))
    or (warehouse_id is not null and public.has_org_permission(
          (select w.organization_id from public.warehouses w where w.id = warehouse_id),
          'store.edit'))
  );

create policy "store.edit can update stock_locations" on public.stock_locations
  for update to authenticated
  using (
    public.is_platform_admin()
    or (store_id is not null and public.has_store_permission(store_id, 'store.edit'))
    or (warehouse_id is not null and public.has_org_permission(
          (select w.organization_id from public.warehouses w where w.id = warehouse_id),
          'store.edit'))
  )
  with check (
    public.is_platform_admin()
    or (store_id is not null and public.has_store_permission(store_id, 'store.edit'))
    or (warehouse_id is not null and public.has_org_permission(
          (select w.organization_id from public.warehouses w where w.id = warehouse_id),
          'store.edit'))
  );
