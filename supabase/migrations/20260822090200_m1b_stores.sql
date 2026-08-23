-- M1b Phase 1, subtask 4: stores table.
-- Deviation from M1b's phrasing ("alter table stores add column organization_id",
-- implying a backfill of one organization per existing store): the live database has
-- no `stores` table at all yet (confirmed via information_schema before writing this
-- migration) — M1's earlier docs describe it, but it was never actually migrated. So
-- this creates the table fresh, with organization_id not null from the start; the
-- backfill step in M1b §3 subtask 4 doesn't apply because there are zero existing rows.

create table stores (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),
  store_code        text,
  name              text,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table stores is
  'A physical (or virtual) selling point, owned by an organization. GSTIN/address '
  'fields are TBD (likely M7 onboarding scope) — see M1-schema-reference.md.';
