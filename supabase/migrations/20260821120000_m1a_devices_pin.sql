-- M1a-identity-auth Task 2: device-gated, per-device PIN login.
-- See specs/tasks/M1a-identity-auth.md and specs/docs/M1-schema-reference.md (v1.1.0).
--
-- PIN is per (device_id, member_id), not per member — each enrolled device keeps its
-- own independent PIN, so setting a PIN on one device never affects another device the
-- same member has enrolled. `members.pin` (reserved by M1-auth-google.md for a future
-- email-OTP login) is untouched here — known, accepted divergence, see the task spec.

alter table members
  add column platform_role text
    check (platform_role is null or platform_role in ('platform_admin'));

comment on column members.platform_role is
  'Platform Owner flag (constitution §1) — independent of any store.';

create table devices (
  id                    uuid primary key default gen_random_uuid(),
  device_id             uuid not null,       -- client-generated, persisted in localStorage; NOT unique alone
  member_id             uuid not null references members(id),
  device_label          text,
  platform              text not null default 'web' check (platform in ('web', 'android')),
  pin_hash              text,
  pin_created_at        timestamptz,
  pin_expires_at        timestamptz,
  pin_failed_attempts   integer not null default 0,
  pin_locked_until      timestamptz,
  enrolled_at           timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  last_login_location   text,
  revoked_at            timestamptz,
  deleted_at            timestamptz
);

create unique index devices_device_member_idx on devices (device_id, member_id);
create index devices_member_id_idx on devices (member_id);

comment on table devices is
  'Enrolled devices gating PIN login. A device can only use PIN after enrolling via '
  'one full Google sign-in. Composite (device_id, member_id) lets a shared physical '
  'device (e.g. a store counter laptop) carry independent enrollments for multiple '
  'staff members.';
comment on column devices.pin_hash is 'Hashed PIN (bcrypt) for this specific device+member — never store raw digits.';
comment on column devices.pin_locked_until is
  'Set (to the lockout time) after 5 failed attempts. Lockout is cleared only by '
  're-enrolling via Google sign-in on this device, not by waiting out a timer — '
  'verify-pin checks pin_failed_attempts >= 5, not whether pin_locked_until has passed.';
comment on column devices.revoked_at is
  'Set when a store owner removes staff access. Admin-portal UI to set this is '
  'backlog (constitution.md §10) — the column/check exists now so RLS/verify-pin '
  'can enforce it once that UI ships.';

alter table devices enable row level security;
-- No policies yet — deny-all default until Phase M1e designs real RLS, matching the
-- same posture members took in 20260820002936_enable_members_rls.sql. Edge Functions
-- use the service-role key and are unaffected.
