-- Warehouses / stock rooms (Inventory M3 prerequisite) — see specs/roadmap/warehouses.md.
--
-- A warehouse is an org-owned STORAGE SPACE (backyard / understairs / stockroom / godown) that
-- holds stock outside a store's selling floor. It is NOT a retail outlet, so it gets its own
-- table rather than a flag on stores (keeps store lists / POS / the store_business_model view
-- clean). A warehouse attaches to one or more stores via warehouse_stores (many-to-many):
--   • a central godown -> many stores;   • a store's own backyard -> that one store;
--   • an org-level warehouse not yet attached -> zero links (still valid, org-wide).
--
-- Warehouses are ORG-SCOPED: RLS uses has_org_permission() (20260826000600). DESIGN
-- (insert/update/soft-delete) is gated on store.edit — the org_owner/org_manager create/edit
-- ability that already governs stores and store placements. READ is open to any active member
-- of the owning org (so the org back-office and, transitively, the intake picker can see them).
-- Soft-delete only (deletes ride the UPDATE policy); a real DELETE stays platform-admin-only.
--
-- The warehouse's INTERNAL placement (shelves/zones/racks) reuses the existing stock_locations
-- tree — see the companion migration 20260918100100_stock_locations_warehouse_owner.sql.

create table public.warehouses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  warehouse_type   text not null default 'stockroom'
                     check (warehouse_type in ('backyard','stockroom','godown','other')),
  note             text,
  sort_order       integer not null default 0,
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.warehouses is
  'Org-owned storage space (backyard/understairs/stockroom/godown) that holds stock outside a '
  'store selling floor. NOT a retail outlet (own table, not a stores flag). Attaches to stores '
  'via warehouse_stores (many-to-many). Internal placement reuses stock_locations. See '
  'specs/roadmap/warehouses.md.';

create index warehouses_org_idx on public.warehouses (organization_id) where deleted_at is null;
create index warehouses_lma_idx on public.warehouses (last_modified_at);

-- Many-to-many attach: which stores a warehouse serves / is attached to.
create table public.warehouse_stores (
  id               uuid primary key default gen_random_uuid(),
  warehouse_id     uuid not null references public.warehouses(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.warehouse_stores is
  'Many-to-many link between a warehouse and the stores it serves/sits at. A central godown '
  'links many stores; a store backyard links exactly one; an unattached org warehouse links '
  'none. Drives which warehouse locations a store sees in the intake picker. See '
  'specs/roadmap/warehouses.md.';

-- A warehouse links a given store at most once (among non-deleted rows).
create unique index warehouse_stores_unique
  on public.warehouse_stores (warehouse_id, store_id) where deleted_at is null;
create index warehouse_stores_store_idx on public.warehouse_stores (store_id) where deleted_at is null;
create index warehouse_stores_wh_idx    on public.warehouse_stores (warehouse_id) where deleted_at is null;
create index warehouse_stores_lma_idx   on public.warehouse_stores (last_modified_at);

-- ── RLS: warehouses ────────────────────────────────────────────────────────────────────────
alter table public.warehouses enable row level security;

-- READ — any active member of the owning org (owner/manager hold store.edit; the read below is
-- deliberately broader than design: it lets the org console and the picker resolve warehouse
-- names/types). inventory.read at org scope covers owner/manager; store staff reach a
-- warehouse's LOCATIONS through the stock_locations policy (via warehouse_stores), not this row.
create policy "org members can read warehouses" on public.warehouses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.read')
    or public.has_org_permission(organization_id, 'store.edit')
  );

create policy "store.edit can insert warehouses" on public.warehouses
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  );

create policy "store.edit can update warehouses" on public.warehouses
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  );

create policy "platform admins can delete warehouses" on public.warehouses
  for delete to authenticated
  using (public.is_platform_admin());

-- ── RLS: warehouse_stores ──────────────────────────────────────────────────────────────────
alter table public.warehouse_stores enable row level security;

-- READ — a member who can read the warehouse (owner/manager of its org) OR who has inventory.read
-- on the linked store (so a store's own staff can see that their store draws from this warehouse).
create policy "read warehouse_stores" on public.warehouse_stores
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(
         (select w.organization_id from public.warehouses w where w.id = warehouse_id),
         'store.edit')
    or public.has_org_permission(
         (select w.organization_id from public.warehouses w where w.id = warehouse_id),
         'inventory.read')
    or public.has_store_permission(store_id, 'inventory.read')
  );

-- DESIGN — attaching/detaching a store is a warehouse-design act: org_owner/org_manager of the
-- warehouse's org (store.edit). Soft-delete rides UPDATE.
create policy "store.edit can insert warehouse_stores" on public.warehouse_stores
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(
         (select w.organization_id from public.warehouses w where w.id = warehouse_id),
         'store.edit')
  );

create policy "store.edit can update warehouse_stores" on public.warehouse_stores
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(
         (select w.organization_id from public.warehouses w where w.id = warehouse_id),
         'store.edit')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(
         (select w.organization_id from public.warehouses w where w.id = warehouse_id),
         'store.edit')
  );

create policy "platform admins can delete warehouse_stores" on public.warehouse_stores
  for delete to authenticated
  using (public.is_platform_admin());
