-- M1b Phase 1, subtask 5: store_invitations, generalized for org-scoped invites.
--
-- Shape chosen (of the two candidates in M1b §7 Open Question 1): a nullable
-- organization_id column alongside the existing store_id, NOT the scope_type/scope_id
-- pattern access_grants uses. Reasoning: access_grants' scope_id is a bare uuid with
-- no FK precisely because it must point at either organizations or stores depending on
-- scope_type — that's the right tradeoff there because access_grants is a generic
-- cross-tenant primitive. store_invitations only ever targets exactly one of two known
-- tables, so a nullable FK column per target keeps real referential integrity (the DB
-- catches a dangling invite target) at a smaller diff than duplicating the generic
-- pattern. Since this table is brand new (not previously migrated), there's no
-- back-compat cost to weigh either way.
--
-- role is now role_id (replacing the old `role text check (owner,staff)` sketch),
-- consistent with memberships. No not-null-either check constraint on
-- (organization_id, store_id), mirroring memberships' own rationale in the previous
-- migration — validity is enforced by whichever function issues the invite.

create table store_invitations (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid references stores(id),
  organization_id   uuid references organizations(id),
  invited_email     text not null,
  role_id           uuid not null references roles(id),
  token             text not null unique,
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by        uuid not null references members(id),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index store_invitations_store_id_idx on store_invitations (store_id) where deleted_at is null;
create index store_invitations_organization_id_idx on store_invitations (organization_id) where deleted_at is null;
create index store_invitations_invited_email_idx on store_invitations (invited_email) where deleted_at is null;

comment on table store_invitations is
  'Invite-gated onboarding — the only path that creates a memberships row for anyone '
  'other than the very first admin-provisioned contact. Either store_id (store-scoped '
  'staff invite) or organization_id (org-scoped Owner/Manager/Accountant invite) is '
  'set, never both — enforced by the issuing function, not a DB constraint.';
