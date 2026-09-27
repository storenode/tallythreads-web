-- Inventory Phase 2B — inventory_items (specs/roadmap/inventory.md §4, §10).
--
-- One row per future SKU: a Ready-for-Inventory invoice line split into items by
-- colour × size × store. The organization catalogues and prices them; Phase 2C's Finalize
-- assigns `sku` server-side; Phase 2D dispatches them. A row with store_id NULL is
-- "unallocated" (it will get a {org_code}-UNA-… SKU).
--
-- ORG-ONLY: rows carry landed_unit_cost_paise (cost), so RLS is inventory.manage on the org
-- (org_owner / org_manager) + platform admin. Store staff will read a price-free view
-- (store_inventory) in Phase 2E, the same split as purchase_* vs incoming_stock.
--
-- Offline-first like every synced table: client-generated id, last_modified_at, soft delete
-- (deleted_at), Dexie mirror + outbox. FKs: the org cascades (hard_delete_organization);
-- a deleted invoice line / store / category leaves the item in place with the link nulled.

create table public.inventory_items (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  source_invoice_item_id  uuid references public.purchase_invoice_items(id) on delete set null,
  store_id                uuid references public.stores(id) on delete set null,
  category_id             uuid references public.inventory_categories(id) on delete set null,
  category_code           text not null
    constraint inventory_items_category_code_format check (category_code ~ '^[A-Z0-9]{2,6}$'),
  name                    text not null check (length(trim(name)) > 0),
  color                   text not null check (length(trim(color)) > 0),
  size                    text not null check (length(trim(size)) > 0),
  quantity                integer not null check (quantity > 0),
  mrp_paise               bigint not null check (mrp_paise >= 0),
  landed_unit_cost_paise  bigint check (landed_unit_cost_paise >= 0),
  status                  text not null default 'draft'
    check (status in ('draft', 'finalized', 'retired')),
  sku                     text,
  replaced_by_item_id     uuid references public.inventory_items(id) on delete set null,
  finalized_at            timestamptz,
  labels_printed          integer not null default 0 check (labels_printed >= 0),
  created_by              uuid references public.members(id) on delete set null,
  last_modified_at        timestamptz not null default now(),
  deleted_at              timestamptz,
  -- A SKU exists exactly when the item has been finalized (retired items keep theirs).
  constraint inventory_items_sku_status check ((sku is null) = (status = 'draft'))
);

comment on table public.inventory_items is
  'Inventory Phase 2: one row per SKU (invoice line × colour × size × store). Org-only (cost). '
  'store_id NULL = unallocated. sku assigned at Finalize (Phase 2C). See roadmap/inventory.md.';

-- A SKU is unique within the org, forever (retired SKUs are never reused).
create unique index inventory_items_org_sku_uq
  on public.inventory_items (organization_id, sku) where sku is not null;
create index inventory_items_org_idx on public.inventory_items (organization_id) where deleted_at is null;
create index inventory_items_source_idx on public.inventory_items (source_invoice_item_id) where deleted_at is null;
create index inventory_items_store_idx on public.inventory_items (store_id) where deleted_at is null;
create index inventory_items_lma_idx on public.inventory_items (last_modified_at);

alter table public.inventory_items enable row level security;

create policy "inventory.manage can read items" on public.inventory_items
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
  );

create policy "inventory.manage can insert items" on public.inventory_items
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
  );

-- Update covers edits and soft-delete. Finalized/retired rows are protected by the trigger
-- below (only descriptive/printing fields may change), not by RLS.
create policy "inventory.manage can update items" on public.inventory_items
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
  );

-- Once an item has a SKU, the SKU-encoded fields (store, category, colour, size) and the SKU
-- itself are frozen — changing them means retire + reissue (§7), never an edit. Draft rows are
-- free to change. Clients can't set a SKU or finalize directly: that is the Finalize RPC's job
-- (Phase 2C, security definer), which sets the session flag checked here.
create or replace function public.inventory_items_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_rpc boolean := coalesce(current_setting('tallythreads.inventory_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if (new.status <> 'draft' or new.sku is not null) and not v_rpc then
      raise exception 'Items are created as drafts; SKUs are assigned by Finalize';
    end if;
    return new;
  end if;

  if v_rpc then
    return new;
  end if;

  if old.status = 'draft' then
    if new.status <> 'draft' or new.sku is not null then
      raise exception 'Finalize assigns SKUs (use the Finalize action)';
    end if;
    return new;
  end if;

  -- finalized / retired: SKU-encoded fields are frozen.
  if new.sku is distinct from old.sku
     or new.status is distinct from old.status
     or new.store_id is distinct from old.store_id
     or new.category_code is distinct from old.category_code
     or upper(new.color) is distinct from upper(old.color)
     or upper(new.size) is distinct from upper(old.size) then
    raise exception 'SKU % is fixed: store, category, colour and size can only change by retiring and reissuing it', old.sku;
  end if;
  return new;
end;
$$;

create trigger inventory_items_guard
  before insert or update on public.inventory_items
  for each row execute function public.inventory_items_guard();
