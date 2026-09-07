-- M4 Purchase-Trip active (in-progress) phase.
--
-- Adds: trip start/complete timestamps; a trip_activities journey log; and AI-scan
-- provenance on supplier invoices (a receipt photo → Claude JSON draft — see the
-- extract-receipt Edge Function). Money stays integer paise; soft-delete + last_modified_at
-- per §6; child-table RLS reaches the org via the parent trip (trip.read / trip.create).
--
-- Review-step decision (2026-09-06): the purchase is approved in person — the owner pays
-- the supplier on the spot — so a scanned invoice is NOT gated behind a blocking approval
-- screen. It's created directly, always editable, and a low/medium-confidence extraction is
-- flagged `needs_review = true` so the owner eyeballs the numbers that feed landed cost
-- (§2.V). High-confidence scans need no action.

-- 1. Trip lifecycle timestamps (status column already exists: planning/active/completed).
alter table purchase_trips add column started_at   timestamptz;
alter table purchase_trips add column completed_at timestamptz;

-- 2. AI-scan provenance on supplier invoices.
alter table purchase_invoices add column source text not null default 'manual'
  check (source in ('manual', 'ai_scan'));
alter table purchase_invoices add column receipt_path text;           -- Supabase Storage object path
alter table purchase_invoices add column ai_confidence text
  check (ai_confidence in ('high', 'medium', 'low'));
alter table purchase_invoices add column needs_review boolean not null default false;

-- 3. Journey activity log — an explicit timeline of what happened on the trip.
create table trip_activities (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references purchase_trips(id),
  member_id         uuid references members(id),   -- who logged it
  kind              text not null
                      check (kind in ('note','started','completed','arrived',
                                      'expense','invoice','receipt_scan')),
  note              text,
  ref_invoice_id    uuid references purchase_invoices(id),  -- optional link to the invoice/scan
  occurred_at       timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);
create index trip_activities_trip_id_idx on trip_activities (trip_id);

-- 4. RLS — same shape as the other purchase_* child tables.
alter table trip_activities enable row level security;

create policy "read activities with trip.read" on trip_activities
  for select to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = trip_activities.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.read'))
  ));

create policy "insert activities with trip.create" on trip_activities
  for insert to authenticated
  with check (exists (
    select 1 from purchase_trips t
    where t.id = trip_activities.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "update activities with trip.create" on trip_activities
  for update to authenticated
  using (exists (
    select 1 from purchase_trips t
    where t.id = trip_activities.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ))
  with check (exists (
    select 1 from purchase_trips t
    where t.id = trip_activities.trip_id
      and (public.is_platform_admin() or public.has_org_permission(t.organization_id, 'trip.create'))
  ));

create policy "delete activities platform admin only" on trip_activities
  for delete to authenticated
  using (public.is_platform_admin());
