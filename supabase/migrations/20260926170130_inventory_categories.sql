-- Inventory categories (Inventory — phase 1) — store-scoped product departments.
--
-- Each store defines its OWN categories (Sarees / Dress Material / Kids / …). An org can add
-- a "Kids" category to one store and not another, so categories are store-scoped, not org-wide.
-- Set up per store in the wizard's Stores step. A stock_location (floor/section/zone/rack) can
-- optionally be tagged with a category (see the category_id column added below), so the
-- placement tree can carry "this rack is Kids".
--
-- `next_sequence` is the per-(store, category) running counter reserved for the later SKU
-- phase (STORE-CATEGORY-COLOR-SIZE-SEQ); unused until inventory items land.
--
-- Store-scoped like stock_locations: RLS uses has_store_permission() (20260831000000), which
-- already cascades org_owner/org_manager. READ = inventory.read, WRITE = inventory.write.
-- Soft-delete only (rides the UPDATE policy); real DELETE stays for the security-definer
-- hard_delete_organization RPC / platform admin path.

create table public.inventory_categories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  name             text not null,
  next_sequence    integer not null default 1,
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.inventory_categories is
  'Store-scoped product categories/departments (Sarees, Kids, …). Each store defines its own. '
  'A stock_location may be tagged with one via stock_locations.category_id. next_sequence is '
  'the per-(store,category) counter reserved for the later SKU phase.';

-- One category name per store (among non-deleted rows).
create unique index inventory_categories_store_name_uq
  on public.inventory_categories (store_id, name) where deleted_at is null;
create index inventory_categories_store_idx on public.inventory_categories (store_id) where deleted_at is null;
create index inventory_categories_org_idx   on public.inventory_categories (organization_id) where deleted_at is null;
create index inventory_categories_lma_idx   on public.inventory_categories (last_modified_at);

alter table public.inventory_categories enable row level security;

create policy "inventory.read can read categories" on public.inventory_categories
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'inventory.read')
  );

create policy "inventory.write can insert categories" on public.inventory_categories
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'inventory.write')
  );

create policy "inventory.write can update categories" on public.inventory_categories
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'inventory.write')
  )
  with check (
    public.is_platform_admin()
    or public.has_store_permission(store_id, 'inventory.write')
  );

-- ── stock_locations: optional category tag ──────────────────────────────────────────────────
-- A placement node (floor/section/zone/rack) can belong to a store category. Store-owned
-- locations only in practice (warehouse locations aren't store-scoped); enforced in the UI.
alter table public.stock_locations
  add column category_id uuid references public.inventory_categories(id) on delete set null;

create index stock_locations_category_idx
  on public.stock_locations (category_id) where category_id is not null;
