-- Stock Placement (Inventory M3 prerequisite) — see specs/roadmap/stock-placement.md.
--
-- One store-scoped location tree. Four node types via placement_type + a self-referencing
-- parent_id: floor/section are containers, zone/rack are leaf placements. Every level is
-- optional (a small boutique keeps a flat list of zones; a big showroom nests
-- floor > section > rack/zone). `code` identifies a location; for racks it is generated from
-- direction+row+column but stays editable. `layout` (jsonb) is RESERVED for a future visual
-- planogram (shape/x/y/w/h) and unused at launch. Offline-first: mirrored in Dexie, synced
-- via the outbox like the purchase_* tables.
--
-- This is the FIRST store-scoped module table (purchase_* are org/trip-scoped). Its RLS uses
-- the store-scoped helper has_store_permission() (20260831000000), seeded ahead of M3 for
-- exactly this: DESIGN (insert/update/delete) is gated on store.edit (org_owner/org_manager,
-- the create/edit-store ability); READ is gated on inventory.read (also store sales/temp staff,
-- so intake can pick a location). Soft-delete only — deletes ride the UPDATE policy.

create table public.stock_locations (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  parent_id        uuid references public.stock_locations(id) on delete cascade,
  placement_type   text not null check (placement_type in ('floor','section','zone','rack')),
  code             text not null,
  label            text,
  direction        text check (direction in ('N','S','E','W','NE','NW','SE','SW')),
  rack_row         text,
  rack_col         text,
  layout           jsonb,
  sort_order       integer not null default 0,
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.stock_locations is
  'Store-scoped placement tree (Stock Placement module, Inventory M3 prereq). '
  'placement_type floor/section = containers, zone/rack = leaf placements; parent_id nests '
  'them. code identifies a location (rack code generated from direction+row+column, editable). '
  'layout jsonb is reserved for a future visual planogram, unused at launch. See '
  'specs/roadmap/stock-placement.md.';

-- code unique among siblings (same store + same parent), case-insensitive, non-deleted.
-- Top-level rows share a null parent_id, folded to a sentinel so they compare as one group.
create unique index stock_locations_sibling_code_uniq on public.stock_locations
  (store_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code))
  where deleted_at is null;

create index stock_locations_store_idx  on public.stock_locations (store_id) where deleted_at is null;
create index stock_locations_parent_idx on public.stock_locations (parent_id);
create index stock_locations_lma_idx    on public.stock_locations (last_modified_at);

alter table public.stock_locations enable row level security;

-- READ — any inventory user (store sales/temp staff via direct membership, or org_owner/
-- org_manager via the org cascade) can read a store's placements, so intake can pick one.
create policy "inventory.read can read stock_locations" on public.stock_locations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'inventory.read')
  );

-- DESIGN — only whoever can edit the store (org_owner/org_manager via store.edit) may create,
-- edit, or (soft-)delete placements. Soft-delete is a plain UPDATE of deleted_at, so it rides
-- the UPDATE policy; a real DELETE stays platform-admin-only for symmetry with stores.
create policy "store.edit can insert stock_locations" on public.stock_locations
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'store.edit')
  );

create policy "store.edit can update stock_locations" on public.stock_locations
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'store.edit')
  )
  with check (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'store.edit')
  );

create policy "platform admins can delete stock_locations" on public.stock_locations
  for delete to authenticated
  using (public.is_platform_admin());
