-- Inventory Phases 2C–2E — SKUs, stock, distribution, store receive/place/move
-- (specs/roadmap/inventory.md §5, §7, §8, §10).
--
--   sku_counters           server-side running numbers per (org, store|UNA, category)
--   finalize_inventory_items(ids)   draft → finalized: assigns SKUs, puts stock at the org
--   stock_transfers (+ items)       org → store dispatches (created/received only via RPCs)
--   stock_movements        APPEND-ONLY log of every quantity change (constitution §6 exception:
--                          quantities are never edited in place — two offline devices can't
--                          overwrite each other; levels are derived)
--   stock_levels (view)    on-hand quantity per item × location, derived from the log
--   dispatch_stock(store, lines)    org holding → in transit; reissues UNA stock with the store's
--                                   SKU (retire/split) so labels can be reprinted
--   receive_transfer(...)           in transit → the store (unplaced / stock room / location);
--                                   shortage + excess recorded
--   store_stock(store) / store_incoming(store)   PRICE-FREE reads for store staff
--
-- Locations: a movement goes FROM one location TO another. A location is
--   kind 'org'     — at the organization (holding / godown), no store
--   kind 'transit' — dispatched to store_id, not yet received
--   kind 'store'   — in store_id: unplaced, or a stock room (warehouse_id), or a placement node
--                    (location_id, store display or inside an attached stock room)
-- A NULL side means stock enters (finalize, excess) or leaves (shortage, sale later) the system.

-- ── helpers ──────────────────────────────────────────────────────────────────────────────
-- SKU segment from free text: uppercase A–Z/0–9, "size" dropped (Free size → FREE), max 6.
create or replace function public.sku_segment(p text) returns text
language sql immutable set search_path to 'public' as $$
  select coalesce(
    nullif(left(regexp_replace(upper(regexp_replace(coalesce(p, ''), '\msize\M', '', 'gi')),
                               '[^A-Z0-9]', '', 'g'), 6), ''),
    'NA');
$$;

-- ── SKU counters ─────────────────────────────────────────────────────────────────────────
create table public.sku_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope           text not null,   -- a store id, or 'UNA' for unallocated stock
  category_code   text not null,
  next_seq        integer not null default 1,
  primary key (organization_id, scope, category_code)
);
comment on table public.sku_counters is
  'Last SKU sequence issued per (org, store|UNA, category). Written only by the SECURITY DEFINER '
  'inventory RPCs; readable by inventory.manage.';
alter table public.sku_counters enable row level security;
create policy "inventory.manage can read sku counters" on public.sku_counters
  for select to authenticated
  using (public.is_platform_admin() or public.has_org_permission(organization_id, 'inventory.manage'));

-- Next SKU for an item (internal; callers hold the RPC flag).
create or replace function public.next_inventory_sku(
  p_org uuid, p_store uuid, p_category_code text, p_color text, p_size text
) returns text
language plpgsql set search_path to 'public' as $$
declare
  v_prefix text;
  v_scope text;
  v_seq integer;
begin
  if p_store is null then
    select org_code into v_prefix from organizations where id = p_org;
    if coalesce(v_prefix, '') = '' then
      raise exception 'Set the organization''s short code (Organization step) before finalizing unallocated stock';
    end if;
    v_prefix := v_prefix || '-UNA';
    v_scope := 'UNA';
  else
    select upper(store_code) into v_prefix from stores where id = p_store;
    if coalesce(v_prefix, '') = '' then
      raise exception 'Store % has no store code — add one before finalizing', p_store;
    end if;
    v_scope := p_store::text;
  end if;

  insert into sku_counters (organization_id, scope, category_code)
  values (p_org, v_scope, p_category_code)
  on conflict (organization_id, scope, category_code)
    do update set next_seq = sku_counters.next_seq + 1
  returning next_seq into v_seq;

  return v_prefix || '-' || p_category_code || '-' || sku_segment(p_color) || '-'
         || sku_segment(p_size) || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ── transfers ────────────────────────────────────────────────────────────────────────────
create table public.stock_transfers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  to_store_id      uuid not null references public.stores(id) on delete cascade,
  status           text not null default 'dispatched' check (status in ('dispatched', 'received')),
  note             text,
  dispatched_at    timestamptz not null default now(),
  dispatched_by    uuid references public.members(id) on delete set null,
  received_at      timestamptz,
  received_by      uuid references public.members(id) on delete set null,
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);
create index stock_transfers_org_idx on public.stock_transfers (organization_id);
create index stock_transfers_store_idx on public.stock_transfers (to_store_id, status);

create table public.stock_transfer_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  transfer_id      uuid not null references public.stock_transfers(id) on delete cascade,
  item_id          uuid not null references public.inventory_items(id) on delete cascade,
  qty_sent         integer not null check (qty_sent > 0),
  qty_received     integer check (qty_received >= 0),
  last_modified_at timestamptz not null default now(),
  deleted_at       timestamptz
);
create index stock_transfer_items_transfer_idx on public.stock_transfer_items (transfer_id);

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
-- Read: the org, or staff of the receiving store. Writes only via dispatch/receive RPCs.
create policy "org or receiving store can read transfers" on public.stock_transfers
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or public.has_store_permission(to_store_id, 'inventory.read')
  );
create policy "org or receiving store can read transfer items" on public.stock_transfer_items
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or exists (select 1 from stock_transfers t
               where t.id = transfer_id and public.has_store_permission(t.to_store_id, 'inventory.read'))
  );

-- ── movements (append-only) ──────────────────────────────────────────────────────────────
create table public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  item_id           uuid not null references public.inventory_items(id) on delete cascade,
  quantity          integer not null check (quantity > 0),
  kind              text not null check (kind in
                      ('finalize', 'reissue', 'dispatch', 'receive', 'shortage', 'excess',
                       'place', 'move', 'adjust')),
  from_kind         text check (from_kind in ('org', 'transit', 'store')),
  from_store_id     uuid references public.stores(id) on delete cascade,
  from_warehouse_id uuid references public.warehouses(id) on delete set null,
  from_location_id  uuid references public.stock_locations(id) on delete set null,
  to_kind           text check (to_kind in ('org', 'transit', 'store')),
  to_store_id       uuid references public.stores(id) on delete cascade,
  to_warehouse_id   uuid references public.warehouses(id) on delete set null,
  to_location_id    uuid references public.stock_locations(id) on delete set null,
  transfer_id       uuid references public.stock_transfers(id) on delete set null,
  reason            text,
  member_id         uuid references public.members(id) on delete set null,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint stock_movements_has_side check (from_kind is not null or to_kind is not null),
  constraint stock_movements_from_store check (from_kind is distinct from 'org' or from_store_id is null),
  constraint stock_movements_to_store check (to_kind is distinct from 'org' or to_store_id is null),
  constraint stock_movements_store_sides check (
    (from_kind not in ('transit', 'store') or from_store_id is not null)
    and (to_kind not in ('transit', 'store') or to_store_id is not null))
);
comment on table public.stock_movements is
  'Append-only stock log (inventory.md §8). Quantities are derived (stock_levels), never edited. '
  'Store staff may insert place/move rows within their own store (offline, via the outbox); every '
  'other kind is written by the inventory RPCs.';
create index stock_movements_item_idx on public.stock_movements (item_id);
create index stock_movements_org_idx on public.stock_movements (organization_id);
create index stock_movements_to_store_idx on public.stock_movements (to_store_id);
create index stock_movements_from_store_idx on public.stock_movements (from_store_id);
create index stock_movements_lma_idx on public.stock_movements (last_modified_at);

alter table public.stock_movements enable row level security;

create policy "org or store can read movements" on public.stock_movements
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or public.has_store_permission(coalesce(to_store_id, from_store_id), 'inventory.read')
  );

-- Store staff: place/move inside their own store. Org roles: anything (RPCs cover the rest).
-- The update policy mirrors insert only because the sync push is an upsert; the immutability
-- trigger below rejects any real change to an existing movement.
create policy "store can place or move within the store" on public.stock_movements
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or (kind in ('place', 'move')
        and from_kind = 'store' and to_kind = 'store'
        and from_store_id = to_store_id
        and public.has_store_permission(to_store_id, 'inventory.write'))
  );
create policy "upsert re-push of the same movement" on public.stock_movements
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or (kind in ('place', 'move') and public.has_store_permission(to_store_id, 'inventory.write'))
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'inventory.manage')
    or (kind in ('place', 'move') and public.has_store_permission(to_store_id, 'inventory.write'))
  );

create or replace function public.stock_movements_immutable()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if (to_jsonb(new) - 'last_modified_at') is distinct from (to_jsonb(old) - 'last_modified_at') then
    raise exception 'Stock movements are append-only; record a new movement instead';
  end if;
  return new;
end;
$$;
create trigger stock_movements_immutable
  before update on public.stock_movements
  for each row execute function public.stock_movements_immutable();

-- A client-side move must name locations that belong to that store.
create or replace function public.stock_location_in_store(
  p_store uuid, p_warehouse uuid, p_location uuid
) returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    (p_warehouse is null or exists (
       select 1 from warehouse_stores ws
       where ws.warehouse_id = p_warehouse and ws.store_id = p_store and ws.deleted_at is null))
    and (p_location is null or exists (
       select 1 from stock_locations l
       where l.id = p_location and l.deleted_at is null
         and (l.store_id = p_store
              or exists (select 1 from warehouse_stores ws
                         where ws.warehouse_id = l.warehouse_id and ws.store_id = p_store
                           and ws.deleted_at is null))));
$$;

create or replace function public.stock_movements_validate()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.from_kind = 'store' and not stock_location_in_store(new.from_store_id, new.from_warehouse_id, new.from_location_id) then
    raise exception 'The "from" location is not part of this store';
  end if;
  if new.to_kind = 'store' and not stock_location_in_store(new.to_store_id, new.to_warehouse_id, new.to_location_id) then
    raise exception 'The "to" location is not part of this store';
  end if;
  return new;
end;
$$;
create trigger stock_movements_validate
  before insert on public.stock_movements
  for each row execute function public.stock_movements_validate();

-- ── levels (derived) ─────────────────────────────────────────────────────────────────────
create view public.stock_levels with (security_invoker = true) as
select organization_id, item_id, loc_kind, store_id, warehouse_id, location_id,
       sum(qty)::integer as quantity
from (
  select organization_id, item_id, to_kind as loc_kind, to_store_id as store_id,
         to_warehouse_id as warehouse_id, to_location_id as location_id, quantity as qty
  from stock_movements where to_kind is not null and deleted_at is null
  union all
  select organization_id, item_id, from_kind, from_store_id, from_warehouse_id, from_location_id,
         -quantity
  from stock_movements where from_kind is not null and deleted_at is null
) m
group by organization_id, item_id, loc_kind, store_id, warehouse_id, location_id
having sum(qty) <> 0;
comment on view public.stock_levels is
  'On-hand quantity per item × location, derived from stock_movements (security_invoker: the '
  'caller''s movement RLS applies).';

-- ── finalize ─────────────────────────────────────────────────────────────────────────────
-- Draft → finalized: validates, assigns SKUs from sku_counters, binds the store's category, and
-- records the stock at the organization. Online only (server-authoritative sequence).
create or replace function public.finalize_inventory_items(p_item_ids uuid[])
returns setof public.inventory_items
language plpgsql security definer set search_path to 'public' as $$
declare
  r inventory_items;
  v_category uuid;
  v_store_name text;
begin
  perform set_config('tallythreads.inventory_rpc', 'on', true);
  for r in
    select * from inventory_items
    where id = any(p_item_ids) and deleted_at is null
    order by name, color, size
    for update
  loop
    if not (is_platform_admin() or has_org_permission(r.organization_id, 'inventory.manage')) then
      raise exception 'Not authorized to finalize inventory for this organization';
    end if;
    if r.status <> 'draft' then
      return next r;
      continue;
    end if;

    v_category := null;
    if r.store_id is not null then
      select c.id into v_category from inventory_categories c
      where c.store_id = r.store_id and c.code = r.category_code and c.deleted_at is null;
      if v_category is null then
        select name into v_store_name from stores where id = r.store_id;
        raise exception '% has no category with code % — add it to the store first', v_store_name, r.category_code;
      end if;
    end if;

    update inventory_items
    set status = 'finalized',
        sku = next_inventory_sku(r.organization_id, r.store_id, r.category_code, r.color, r.size),
        category_id = v_category,
        finalized_at = now(),
        last_modified_at = now()
    where id = r.id
    returning * into r;

    insert into stock_movements (organization_id, item_id, quantity, kind, to_kind, member_id)
    values (r.organization_id, r.id, r.quantity, 'finalize', 'org', auth.uid());

    return next r;
  end loop;
  perform set_config('tallythreads.inventory_rpc', 'off', true);
end;
$$;

-- ── dispatch ─────────────────────────────────────────────────────────────────────────────
-- p_lines: [{"item_id": uuid, "qty": int}]. Items must be finalized, at the org, and either
-- allocated to p_store or unallocated (UNA). UNA stock is re-issued with the store's SKU: the
-- dispatched quantity moves to a new item (new SKU, labels must be reprinted); the UNA item is
-- retired if nothing is left of it. Returns {transfer_id, reissued: [{from_sku, item_id, sku, qty}]}.
create or replace function public.dispatch_stock(p_store_id uuid, p_lines jsonb, p_note text default null)
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

-- ── receive ──────────────────────────────────────────────────────────────────────────────
-- p_lines: [{"item_id": uuid, "qty_received": int}] (missing lines = received in full).
-- Received stock goes to the store — unplaced, or the given stock room / placement node.
-- Short → 'shortage' out of transit; extra → 'excess' into the store.
create or replace function public.receive_transfer(
  p_transfer_id uuid, p_lines jsonb,
  p_to_warehouse_id uuid default null, p_to_location_id uuid default null
) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_t stock_transfers;
  v_ti stock_transfer_items;
  v_got integer;
begin
  select * into v_t from stock_transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Dispatch not found'; end if;
  if not (is_platform_admin() or has_org_permission(v_t.organization_id, 'inventory.manage')
          or has_store_permission(v_t.to_store_id, 'inventory.write')) then
    raise exception 'Not authorized to receive for this store';
  end if;
  if v_t.status <> 'dispatched' then raise exception 'This dispatch was already received'; end if;
  if not stock_location_in_store(v_t.to_store_id, p_to_warehouse_id, p_to_location_id) then
    raise exception 'That location is not part of this store';
  end if;

  for v_ti in select * from stock_transfer_items where transfer_id = v_t.id and deleted_at is null loop
    select (l ->> 'qty_received')::integer into v_got
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
    where (l ->> 'item_id')::uuid = v_ti.item_id
    limit 1;
    v_got := greatest(coalesce(v_got, v_ti.qty_sent), 0);

    if least(v_got, v_ti.qty_sent) > 0 then
      insert into stock_movements (
        organization_id, item_id, quantity, kind, from_kind, from_store_id, to_kind, to_store_id,
        to_warehouse_id, to_location_id, transfer_id, member_id)
      values (v_t.organization_id, v_ti.item_id, least(v_got, v_ti.qty_sent), 'receive',
              'transit', v_t.to_store_id, 'store', v_t.to_store_id,
              p_to_warehouse_id, p_to_location_id, v_t.id, auth.uid());
    end if;
    if v_got < v_ti.qty_sent then
      insert into stock_movements (
        organization_id, item_id, quantity, kind, from_kind, from_store_id, transfer_id, member_id, reason)
      values (v_t.organization_id, v_ti.item_id, v_ti.qty_sent - v_got, 'shortage',
              'transit', v_t.to_store_id, v_t.id, auth.uid(), 'short on receiving');
    elsif v_got > v_ti.qty_sent then
      insert into stock_movements (
        organization_id, item_id, quantity, kind, to_kind, to_store_id, to_warehouse_id,
        to_location_id, transfer_id, member_id, reason)
      values (v_t.organization_id, v_ti.item_id, v_got - v_ti.qty_sent, 'excess', 'store',
              v_t.to_store_id, p_to_warehouse_id, p_to_location_id, v_t.id, auth.uid(),
              'extra on receiving');
    end if;

    update stock_transfer_items set qty_received = v_got, last_modified_at = now() where id = v_ti.id;
  end loop;

  update stock_transfers
  set status = 'received', received_at = now(), received_by = auth.uid(), last_modified_at = now()
  where id = v_t.id;
end;
$$;

-- ── store reads (price-free) ─────────────────────────────────────────────────────────────
-- Stock on hand in a store, per item × location. No cost columns (store staff never see cost).
create or replace function public.store_stock(p_store_id uuid)
returns table (
  item_id uuid, sku text, name text, color text, size text, category_code text,
  mrp_paise bigint, warehouse_id uuid, warehouse_name text, location_id uuid,
  location_code text, quantity integer)
language sql stable security definer set search_path to 'public' as $$
  select l.item_id, i.sku, i.name, i.color, i.size, i.category_code, i.mrp_paise,
         l.warehouse_id, w.name, l.location_id, sl.code, l.quantity
  from (
    select item_id, warehouse_id, location_id, sum(qty)::integer as quantity
    from (
      select item_id, to_warehouse_id as warehouse_id, to_location_id as location_id, quantity as qty
      from stock_movements where to_kind = 'store' and to_store_id = p_store_id and deleted_at is null
      union all
      select item_id, from_warehouse_id, from_location_id, -quantity
      from stock_movements where from_kind = 'store' and from_store_id = p_store_id and deleted_at is null
    ) m
    group by item_id, warehouse_id, location_id
    having sum(qty) <> 0
  ) l
  join inventory_items i on i.id = l.item_id
  left join warehouses w on w.id = l.warehouse_id
  left join stock_locations sl on sl.id = l.location_id
  where is_platform_admin() or has_store_permission(p_store_id, 'inventory.read')
  order by i.name, i.color, i.size;
$$;

-- Dispatches on their way to a store, with their lines (price-free).
create or replace function public.store_incoming(p_store_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(t order by t ->> 'dispatched_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', st.id, 'status', st.status, 'note', st.note, 'dispatched_at', st.dispatched_at,
      'received_at', st.received_at,
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

-- ── API exposure ─────────────────────────────────────────────────────────────────────────
-- RPCs are for signed-in members only; trigger/internal functions are not callable at all.
revoke execute on function public.finalize_inventory_items(uuid[]) from public, anon;
revoke execute on function public.dispatch_stock(uuid, jsonb, text) from public, anon;
revoke execute on function public.receive_transfer(uuid, jsonb, uuid, uuid) from public, anon;
revoke execute on function public.store_stock(uuid) from public, anon;
revoke execute on function public.store_incoming(uuid) from public, anon;
grant execute on function public.finalize_inventory_items(uuid[]) to authenticated;
grant execute on function public.dispatch_stock(uuid, jsonb, text) to authenticated;
grant execute on function public.receive_transfer(uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.store_stock(uuid) to authenticated;
grant execute on function public.store_incoming(uuid) to authenticated;
revoke execute on function public.next_inventory_sku(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.stock_movements_immutable() from public, anon, authenticated;
revoke execute on function public.stock_movements_validate() from public, anon, authenticated;
-- Used by the movement-validation trigger, which runs as the signed-in member.
revoke execute on function public.stock_location_in_store(uuid, uuid, uuid) from public, anon;
grant execute on function public.stock_location_in_store(uuid, uuid, uuid) to authenticated;
