-- M4 Purchase-Trip — the four core tables + RLS.
--
-- Records a store owner's buying trip: the trip itself (with a planning phase —
-- route/budget/estimated expenses), the supplier invoices bought on it, their line
-- items, and the shared trip expenses. Landed cost, suggested MRP, and the forecast
-- are DERIVED in lib/ (not stored). Design: specs/roadmap/purchase-trips.md §5.
--
-- Org-type independent: a trip belongs to the SOURCING organization (independent,
-- chain, or a franchisor like Bandrip Corporate) — never keyed off an org "type".
--
-- All money is integer paise. Soft delete only (deleted_at) + last_modified_at for
-- last-write-wins, per constitution §6 (these are sync-participating tables — M2).
--
-- RLS gates on the existing trip.create / trip.read permission keys (already seeded
-- for org_owner + org_manager in 20260826000800), via has_org_permission() — the same
-- pattern 20260826000600_stores_create_rls.sql established. The price-free store-staff
-- "incoming stock" view + a new trip.view_incoming permission are a SEPARATE later
-- migration (visibility task), not here.

-- ─── Tables ───────────────────────────────────────────────────────────

create table purchase_trips (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations(id),
  created_by                uuid not null references members(id),
  title                     text not null,
  status                    text not null default 'planning'
                              check (status in ('planning', 'active', 'completed')),
  -- planning phase
  start_date                date,
  end_date                  date,
  route                     jsonb,            -- [{from, to, mode}] legs
  planned_budget_paise      bigint,
  estimated_expenses_paise  bigint,
  expense_estimate_source   text check (expense_estimate_source in ('manual', 'ai')),
  expected_margin_pct       numeric,
  notes                     text,
  last_modified_at          timestamptz not null default now(),
  deleted_at                timestamptz
);

create table purchase_invoices (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references purchase_trips(id),
  supplier_name         text not null,        -- free-text in Phase 1 (no suppliers master)
  supplier_gstin        text,
  supplier_invoice_no   text,
  invoice_date          date,
  margin_config         jsonb,                -- data-driven recipe; OR…
  margin_plugin_id      text,                 -- …a coded plugin key (at most one)
  notes                 text,
  last_modified_at      timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint purchase_invoices_one_margin_source
    check (margin_config is null or margin_plugin_id is null)
);

create table purchase_invoice_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references purchase_invoices(id),
  description       text not null,            -- model/style; becomes a product in M3
  hsn_code          text,                     -- optional; GST detail deferred to M5
  quantity          integer not null check (quantity > 0),
  unit_cost_paise   bigint not null check (unit_cost_paise >= 0),
  is_trending       boolean not null default false,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

create table trip_expenses (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references purchase_trips(id),
  category          text not null
                      check (category in ('travel', 'lodging', 'food', 'transport', 'other')),
  amount_paise      bigint not null check (amount_paise >= 0),
  note              text,
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ─── Indexes (FK / pull performance) ─────────────────────────────────
create index purchase_trips_organization_id_idx on purchase_trips (organization_id);
create index purchase_invoices_trip_id_idx on purchase_invoices (trip_id);
create index purchase_invoice_items_invoice_id_idx on purchase_invoice_items (invoice_id);
create index trip_expenses_trip_id_idx on trip_expenses (trip_id);

-- ─── RLS ──────────────────────────────────────────────────────────────
-- SELECT gated by trip.read, writes by trip.create (both org-scoped, already granted
-- to org_owner + org_manager). Child tables reach the org via their parent trip.
-- DELETE is platform-admin-only defensively — the app soft-deletes via UPDATE
-- (deleted_at), never a hard delete on these sync tables (§6).

alter table purchase_trips enable row level security;
alter table purchase_invoices enable row level security;
alter table purchase_invoice_items enable row level security;
alter table trip_expenses enable row level security;

-- purchase_trips
create policy "read trips with trip.read" on purchase_trips
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'trip.read')
  );

create policy "insert trips with trip.create" on purchase_trips
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'trip.create')
  );

create policy "update trips with trip.create" on purchase_trips
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'trip.create')
  )
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'trip.create')
  );

create policy "delete trips platform admin only" on purchase_trips
  for delete to authenticated
  using (public.is_platform_admin());

-- purchase_invoices (org via parent trip)
create policy "read invoices with trip.read" on purchase_invoices
  for select to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = purchase_invoices.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.read'))
  ));

create policy "insert invoices with trip.create" on purchase_invoices
  for insert to authenticated
  with check (exists (
    select 1 from purchase_trips t
    where t.id = purchase_invoices.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "update invoices with trip.create" on purchase_invoices
  for update to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = purchase_invoices.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ))
  with check (exists (
    select 1 from purchase_trips t
    where t.id = purchase_invoices.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "delete invoices platform admin only" on purchase_invoices
  for delete to authenticated
  using (public.is_platform_admin());

-- purchase_invoice_items (org via invoice -> trip)
create policy "read items with trip.read" on purchase_invoice_items
  for select to authenticated
  using (exists (
    select 1 from purchase_invoices pi
    join purchase_trips t on t.id = pi.trip_id
    where pi.id = purchase_invoice_items.invoice_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.read'))
  ));

create policy "insert items with trip.create" on purchase_invoice_items
  for insert to authenticated
  with check (exists (
    select 1 from purchase_invoices pi
    join purchase_trips t on t.id = pi.trip_id
    where pi.id = purchase_invoice_items.invoice_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "update items with trip.create" on purchase_invoice_items
  for update to authenticated
  using (exists (
    select 1 from purchase_invoices pi
    join purchase_trips t on t.id = pi.trip_id
    where pi.id = purchase_invoice_items.invoice_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ))
  with check (exists (
    select 1 from purchase_invoices pi
    join purchase_trips t on t.id = pi.trip_id
    where pi.id = purchase_invoice_items.invoice_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "delete items platform admin only" on purchase_invoice_items
  for delete to authenticated
  using (public.is_platform_admin());

-- trip_expenses (org via parent trip)
create policy "read expenses with trip.read" on trip_expenses
  for select to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = trip_expenses.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.read'))
  ));

create policy "insert expenses with trip.create" on trip_expenses
  for insert to authenticated
  with check (exists (
    select 1 from purchase_trips t
    where t.id = trip_expenses.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "update expenses with trip.create" on trip_expenses
  for update to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = trip_expenses.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ))
  with check (exists (
    select 1 from purchase_trips t
    where t.id = trip_expenses.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "delete expenses platform admin only" on trip_expenses
  for delete to authenticated
  using (public.is_platform_admin());
