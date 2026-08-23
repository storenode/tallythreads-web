-- M1b Phase 1, subtask 6: channels and access_grants — unchanged from
-- M1-core-tenancy-schema.md §2 / M1-schema-reference.md §2.

create table channels (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id),
  channel_type  text not null check (channel_type in ('pos', 'online')),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table channels is
  'A store can sell through more than one channel. Only pos is used in Phase 1; '
  'exists so Omnichannel (Phase 3) has somewhere to land later without a new table.';

create table access_grants (
  id                 uuid primary key default gen_random_uuid(),
  grantee_member_id  uuid not null references members(id),
  scope_type         text not null check (scope_type in ('organization', 'store')),
  scope_id           uuid not null,
  permission         text not null check (permission in ('read_only', 'reports_only', 'full')),
  granted_by         uuid not null references members(id),
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index access_grants_grantee_member_id_idx on access_grants (grantee_member_id) where deleted_at is null;
create index access_grants_scope_idx on access_grants (scope_type, scope_id) where deleted_at is null;

comment on table access_grants is
  'Generic cross-tenant read primitive — a franchisor''s visibility into a franchisee, '
  'and any future read-only party (accountant, auditor) not already covered by roles. '
  'scope_id references organizations.id or stores.id depending on scope_type — no FK, '
  'since it targets either table (unlike store_invitations, which got real FKs).';
