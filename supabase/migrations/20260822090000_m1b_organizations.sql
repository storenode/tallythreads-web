-- M1b Phase 1, subtask 1: organizations table.
-- Top-level billing/subscription entity — an independent owner, a chain owner, and a
-- franchisor are all just an organization. See specs/tasks/M1b-Core-Tenancy-Schema.md.

create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table organizations is
  'Top-level billing/subscription entity. Independent owner, chain owner, and '
  'franchisor are all just an organization — see M1-core-tenancy-schema.md.';
