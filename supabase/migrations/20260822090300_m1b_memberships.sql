-- M1b Phase 1, subtask 3: memberships table.
-- Replaces the earlier `role text check (role in ('owner','staff'))` sketch from
-- M1-core-tenancy-schema.md with role_id, referencing the real roles/permissions model.
--
-- Deliberately no not-null-either check constraint on (organization_id, store_id):
-- whether an org id, a store id, or neither (platform scope) is valid depends on the
-- role's scope_type, which a plain column check constraint can't look up in another
-- table. That validity is enforced by whatever writes this table (each function only
-- ever writes the combination its own role's scope_type allows) — see M1b §2.

create table memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id),
  role_id           uuid not null references roles(id),
  organization_id   uuid references organizations(id),
  store_id          uuid references stores(id),
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

create index memberships_member_id_idx on memberships (member_id) where deleted_at is null;
create index memberships_organization_id_idx on memberships (organization_id) where deleted_at is null;
create index memberships_store_id_idx on memberships (store_id) where deleted_at is null;

comment on table memberships is
  'Who can act where, and as what role — the only mechanism that grants access to '
  'an organization or store. organization_id/store_id validity against the role''s '
  'scope_type is enforced at the application layer, not by a DB check constraint.';
