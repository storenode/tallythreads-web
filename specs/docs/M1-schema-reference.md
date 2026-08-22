# M1-schema-reference — Consolidated Table Reference

**Status:** Consolidation of `M1-auth-google.md`, `M1-core-tenancy-schema.md`,
`M1-franchise-model.md`, and PIN/device-enrollment design discussed but not yet
written down elsewhere. This is the single source to build migrations against.
**Version:** 1.1.0

---

## 0. Note on scope

Fourteen tables, one derived view. Grouped below by concern: Identity & Device, Tenancy
& Access, Stock Distribution, Franchise & Settlement. Line-item detail tables that
belong to other modules (`stock_transfer_items`, invoice/product tables — M3/M5) are out
of scope here.

**Gap closed in this pass:** `members.pin` (a single reserved column) is replaced below
with the actual PIN design from our conversation — hashed, expiring, lockout-tracked,
and gated by a new `devices` table. Neither of those existed in any doc until now.

**v1.1.0 change:** the PIN is **per device, not per member** — each enrolled device
keeps its own independent PIN, so setting/resetting a PIN on one device never affects
another device the same member has enrolled. The `pin_*` columns therefore moved from
`members` to `devices`, and `devices` gained a server-generated surrogate `id` plus a
`device_id`/`member_id` composite so more than one member can enroll the same physical
device (a shared store laptop/tablet) without colliding — see `devices` below.

---

## 1. Identity & Device

### `members`

Purpose: one row per verified person (Google identity), never scoped to a store.

| Column                | Type                                        | Notes                                                                                               |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                  | uuid, PK                                    | Server-generated                                                                                    |
| `google_id`           | text, unique, nullable                      | Google's `sub` claim. Nullable now (was `not null`) — an email-OTP-only or PIN-only member has none |
| `google_email`        | text                                        | Not unique — display/contact only, not identity                                                     |
| `email_verified`      | boolean                                     | From Google's identity payload                                                                      |
| `first_name`          | text, nullable                              |                                                                                                     |
| `last_name`           | text, nullable                              |                                                                                                     |
| `avatar_url`          | text, nullable                              |                                                                                                     |
| `locale`              | text, nullable                              |                                                                                                     |
| `platform_role`       | text, nullable, check in (`platform_admin`) | Platform Owner flag (constitution §1) — independent of any store                                    |
| `created_at`          | timestamptz                                 |                                                                                                     |
| `last_modified_at`    | timestamptz                                 |                                                                                                     |
| `deleted_at`          | timestamptz, nullable                       |                                                                                                     |

### `devices`

Purpose: gates PIN login, and now also **holds the PIN itself** — the PIN is
per-device, per-member, not member-wide (v1.1.0 change, see note above). A device can
only use PIN after enrolling via one full Google sign-in, and each `(device_id,
member_id)` pair carries its own independent PIN and lockout state.

`id` is a server-generated surrogate key; `device_id` is the client-generated UUID
(persisted in `localStorage`/Keychain) that identifies the physical browser/device,
never server-assigned. Splitting these two apart is what allows more than one member
to enroll the same physical device — a shared store counter laptop/tablet used by
several staff — without a primary-key collision: each staff member gets their own
`devices` row for the same `device_id`, distinguished by `member_id`.

| Column                | Type                               | Notes                                                                                                                                                                                 |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid, PK                           | Server-generated surrogate key                                                                                                                                                        |
| `device_id`           | uuid, not null                     | Client-generated (UUID persisted in localStorage/Keychain), identifies the browser/device only — **not unique alone**, see composite constraint below                                |
| `member_id`           | uuid, FK → `members.id`, not null  |                                                                                                                                                                                       |
| `device_label`        | text, nullable                     | e.g. "Shop tablet", for the owner's own reference                                                                                                                                     |
| `platform`            | text, check in (`web`, `android`)  | `android` unused until a native client exists                                                                                                                                         |
| `pin_hash`            | text, nullable                     | Hashed PIN (bcrypt/argon2) for this specific device+member — never store raw digits. Moved here from `members` in v1.1.0                                                             |
| `pin_created_at`      | timestamptz, nullable              |                                                                                                                                                                                       |
| `pin_expires_at`      | timestamptz, nullable              | 30-day validity                                                                                                                                                                       |
| `pin_failed_attempts` | integer, not null, default 0       | Reset on success                                                                                                                                                                      |
| `pin_locked_until`    | timestamptz, nullable              | Set after 5 failed attempts; cleared only by completing Google sign-in again on this device, not by a timer                                                                          |
| `enrolled_at`         | timestamptz                        | Set on first successful Google sign-in from this `(device_id, member_id)` pair                                                                                                       |
| `last_seen_at`        | timestamptz                        | Updated on each PIN or Google login                                                                                                                                                   |
| `last_login_location` | text, nullable                     | IP-derived location captured on each login, for future admin-portal visibility (constitution §10) — informational only, not used for any access decision                            |
| `revoked_at`          | timestamptz, nullable              | Set when a store owner removes staff access (see `M1-franchise-model.md`/invite discussion) — a revoked device can no longer complete PIN login even if the PIN itself hasn't expired |
| `deleted_at`          | timestamptz, nullable              |                                                                                                                                                                                       |

Constraint: unique on (`device_id`, `member_id`).

---

## 2. Tenancy & Access

### `organizations`

Purpose: top-level billing/subscription entity — an independent owner, a chain owner,
or a franchisor are all just an `organization`.

| Column             | Type                  | Notes |
| ------------------ | --------------------- | ----- |
| `id`               | uuid, PK              |       |
| `name`             | text                  |       |
| `created_at`       | timestamptz           |       |
| `last_modified_at` | timestamptz           |       |
| `deleted_at`       | timestamptz, nullable |       |

### `stores` (extends the existing table)

Purpose: a physical (or virtual) selling point.

| Column             | Type                                    | Notes                                     |
| ------------------ | --------------------------------------- | ----------------------------------------- |
| `id`               | uuid, PK                                |                                           |
| `organization_id`  | uuid, FK → `organizations.id`, not null | **New column added here**                 |
| `store_code`       | text                                    | Feeds invoice numbering (constitution §6) |
| `name`             | text                                    |                                           |
| `created_at`       | timestamptz                             |                                           |
| `last_modified_at` | timestamptz                             |                                           |
| `deleted_at`       | timestamptz, nullable                   |                                           |

GSTIN, address, and other business-registration fields are not yet speced — flagged as
TBD, likely M7 (Settings/onboarding) scope, not blocking M1.

### `memberships`

Purpose: who can act where, and as what role. The only mechanism that grants access to
an organization or store — never created by the act of signing in.

| Column             | Type                                    | Notes |
| ------------------ | --------------------------------------- | ----- |
| `id`               | uuid, PK                                |       |
| `member_id`        | uuid, FK → `members.id`                 |       |
| `organization_id`  | uuid, FK → `organizations.id`, nullable |       |
| `store_id`         | uuid, FK → `stores.id`, nullable        |       |
| `role`             | text, check in (`owner`, `staff`)       |       |
| `created_at`       | timestamptz                             |       |
| `last_modified_at` | timestamptz                             |       |
| `deleted_at`       | timestamptz, nullable                   |       |

Constraint: `organization_id is not null or store_id is not null`.

### `store_invitations`

Purpose: invite-gated onboarding — the only path that leads to a `memberships` row for
anyone other than the very first owner.

| Column          | Type                                                                            | Notes                  |
| --------------- | ------------------------------------------------------------------------------- | ---------------------- |
| `id`            | uuid, PK                                                                        |                        |
| `store_id`      | uuid, FK → `stores.id`                                                          |                        |
| `invited_email` | text                                                                            |                        |
| `role`          | text, check in (`owner`, `staff`)                                               |                        |
| `token`         | text, unique                                                                    | Single-use invite link |
| `status`        | text, check in (`pending`, `accepted`, `expired`, `revoked`), default `pending` |                        |
| `invited_by`    | uuid, FK → `members.id`                                                         |                        |
| `expires_at`    | timestamptz                                                                     |                        |
| `created_at`    | timestamptz                                                                     |                        |
| `deleted_at`    | timestamptz, nullable                                                           |                        |

### `access_grants`

Purpose: the one generic cross-tenant read primitive — Platform Owner access, a
franchisor's visibility into franchisees, and any future read-only party (accountant,
auditor) are all this same mechanism.

| Column              | Type                                                 | Notes                                                                         |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                | uuid, PK                                             |                                                                               |
| `grantee_member_id` | uuid, FK → `members.id`                              |                                                                               |
| `scope_type`        | text, check in (`organization`, `store`)             |                                                                               |
| `scope_id`          | uuid                                                 | References either `organizations.id` or `stores.id` depending on `scope_type` |
| `permission`        | text, check in (`read_only`, `reports_only`, `full`) |                                                                               |
| `granted_by`        | uuid, FK → `members.id`                              |                                                                               |
| `expires_at`        | timestamptz, nullable                                |                                                                               |
| `created_at`        | timestamptz                                          |                                                                               |
| `deleted_at`        | timestamptz, nullable                                |                                                                               |

### `channels`

Purpose: a store can sell through more than one channel. Only `pos` is used in Phase 1;
exists so Omnichannel (Phase 3) has somewhere to land later.

| Column         | Type                             | Notes                      |
| -------------- | -------------------------------- | -------------------------- |
| `id`           | uuid, PK                         |                            |
| `store_id`     | uuid, FK → `stores.id`           |                            |
| `channel_type` | text, check in (`pos`, `online`) | Only `pos` populated in M1 |
| `created_at`   | timestamptz                      |                            |
| `deleted_at`   | timestamptz, nullable            |                            |

---

## 3. Stock Distribution

### `stock_locations`

Purpose: a central godown/warehouse that distributes stock to one or more stores.

| Column            | Type                          | Notes |
| ----------------- | ----------------------------- | ----- |
| `id`              | uuid, PK                      |       |
| `organization_id` | uuid, FK → `organizations.id` |       |
| `name`            | text                          |       |
| `created_at`      | timestamptz                   |       |
| `deleted_at`      | timestamptz, nullable         |       |

### `stock_transfers`

Purpose: header record of one stock movement from a location to a store. Used
identically by Chain (no payment implied) and Franchise (implies a settlement — see §4).
Line items live in a separate M3-scope table, not here.

| Column              | Type                            | Notes |
| ------------------- | ------------------------------- | ----- |
| `id`                | uuid, PK                        |       |
| `stock_location_id` | uuid, FK → `stock_locations.id` |       |
| `store_id`          | uuid, FK → `stores.id`          |       |
| `transferred_at`    | timestamptz                     |       |
| `last_modified_at`  | timestamptz                     |       |
| `deleted_at`        | timestamptz, nullable           |       |

---

## 4. Franchise & Settlement

### `franchise_groups`

Purpose: a franchisor brand/entity (e.g. Bandrip), distinct from any single store.

| Column              | Type                          | Notes |
| ------------------- | ----------------------------- | ----- |
| `id`                | uuid, PK                      |       |
| `franchisor_org_id` | uuid, FK → `organizations.id` |       |
| `name`              | text                          |       |
| `created_at`        | timestamptz                   |       |
| `deleted_at`        | timestamptz, nullable         |       |

### `franchise_memberships`

Purpose: links a specific store to a franchise group for a period of time. This table —
not a stored label — is what a store's derived business model (§5) checks.

| Column               | Type                             | Notes               |
| -------------------- | -------------------------------- | ------------------- |
| `id`                 | uuid, PK                         |                     |
| `store_id`           | uuid, FK → `stores.id`           |                     |
| `franchise_group_id` | uuid, FK → `franchise_groups.id` |                     |
| `agreement_start`    | date                             |                     |
| `agreement_end`      | date, nullable                   | null = still active |
| `created_at`         | timestamptz                      |                     |
| `last_modified_at`   | timestamptz                      |                     |
| `deleted_at`         | timestamptz, nullable            |                     |

### `settlement_rules`

Purpose: one franchise agreement's terms, expressed as rule-engine configuration
(`M1-franchise-model.md` §4) — versioned by effective date so a renegotiated contract
never rewrites history.

| Column               | Type                             | Notes                             |
| -------------------- | -------------------------------- | --------------------------------- |
| `id`                 | uuid, PK                         |                                   |
| `franchise_group_id` | uuid, FK → `franchise_groups.id` |                                   |
| `config`             | jsonb                            | Ordered list of rule-engine steps |
| `effective_from`     | date                             |                                   |
| `effective_to`       | date, nullable                   |                                   |
| `created_at`         | timestamptz                      |                                   |
| `deleted_at`         | timestamptz, nullable            |                                   |

### `settlement_statements`

Purpose: the actual computed result for one store, one period — persisted, never
silently recomputed after issuance.

| Column                      | Type                   | Notes                                            |
| --------------------------- | ---------------------- | ------------------------------------------------ |
| `id`                        | uuid, PK               |                                                  |
| `store_id`                  | uuid, FK → `stores.id` |                                                  |
| `period_start`              | date                   |                                                  |
| `period_end`                | date                   |                                                  |
| `gross_revenue_paise`       | bigint                 | Integer paise, per the existing money convention |
| `breakdown`                 | jsonb                  | Step-by-step results from the rule engine        |
| `total_to_franchisor_paise` | bigint                 |                                                  |
| `store_net_paise`           | bigint                 |                                                  |
| `computed_at`               | timestamptz            |                                                  |
| `last_modified_at`          | timestamptz            |                                                  |
| `deleted_at`                | timestamptz, nullable  |                                                  |

---

## 5. Companion view (not a table)

### `store_business_model`

A store's business model is derived, never stored — see `M1-core-tenancy-schema.md` §4
for the full view definition and rationale. Reads `franchise_memberships` and `stores`
grouped by `organization_id`; nothing above stores a `business_type` column anywhere.

---

## 6. Summary table

| Table                   | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `members`               | Verified person identity (Google identity, platform role)          |
| `devices`               | Enrolled devices, each with its own independent PIN gating login   |
| `organizations`         | Top-level billing entity                                           |
| `stores`                | A selling point (extended with `organization_id`)                  |
| `memberships`           | Who can act where, and as what role                                |
| `store_invitations`     | Invite-gated onboarding                                            |
| `access_grants`         | Generic cross-tenant read primitive                                |
| `channels`              | Sales channel per store (`pos`/`online`)                           |
| `stock_locations`       | A central godown/warehouse                                         |
| `stock_transfers`       | Header record of a stock movement                                  |
| `franchise_groups`      | A franchisor brand/entity                                          |
| `franchise_memberships` | Store ↔ franchise-group link                                       |
| `settlement_rules`      | A franchise agreement's terms as configuration                     |
| `settlement_statements` | A computed, persisted monthly settlement                           |
