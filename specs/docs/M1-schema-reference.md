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

**Changed in v1.1.0 (2026-08-21):** PIN fields moved off `members` and onto `devices` —
the PIN is now per-device, not per-member. This matters for a shared physical device
(a shop tablet at the counter) used by more than one staff member: each staff member's
Google sign-in on that device now gets its own `devices` row and its own PIN, rather than
one member-level PIN that would collide or leak across whoever last signed in on that
hardware. To support that, `devices` gets a server-generated surrogate `id` (was
client-generated before) plus a separate `device_id` (the actual hardware/browser
identifier) and a `unique (device_id, member_id)` constraint — one row per
device-and-member pairing, so the same physical device can carry several enrolled
members simultaneously. Also added: `last_login_location` (informational, not used for
any access decision in M1). `pin_locked_until` now clears only via a fresh Google
sign-in on that device, not a timer — consistent with the enrollment-gates-PIN model.

---

## 1. Identity & Device

### `members`
Purpose: one row per verified person (Google identity), never scoped to a store. No
longer carries any PIN state — see `devices` below.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Server-generated |
| `google_id` | text, unique, nullable | Google's `sub` claim. Nullable now (was `not null`) — an email-OTP-only or PIN-only member has none |
| `google_email` | text | Not unique — display/contact only, not identity |
| `email_verified` | boolean | From Google's identity payload |
| `first_name` | text, nullable | |
| `last_name` | text, nullable | |
| `avatar_url` | text, nullable | |
| `locale` | text, nullable | |
| `platform_role` | text, nullable, check in (`platform_admin`) | Platform Owner flag (constitution §1) — independent of any store |
| `created_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `devices`
Purpose: gates PIN login, and now carries the PIN itself, per device-and-member pair. A
device can only use PIN after enrolling via one full Google sign-in. Also feeds
`{device_id}` in the invoice-numbering scheme (constitution §6).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Server-generated surrogate key (changed from client-generated in v1.0.0) |
| `device_id` | uuid | The actual hardware/browser identifier (persisted client-side in localStorage/Keychain) — no longer the PK, since one physical device can now carry several members |
| `member_id` | uuid, FK → `members.id` | |
| `device_label` | text, nullable | e.g. "Shop tablet", for the owner's own reference |
| `platform` | text, check in (`web`, `android`) | `android` unused until a native client exists |
| `pin_hash` | text, nullable | Hashed PIN (bcrypt/argon2) — never store raw digits. **Moved from `members` in v1.1.0** |
| `pin_created_at` | timestamptz, nullable | |
| `pin_expires_at` | timestamptz, nullable | 30-day validity |
| `pin_failed_attempts` | integer, not null, default 0 | Reset on success |
| `pin_locked_until` | timestamptz, nullable | Lockout after repeated failures; clears only via a fresh Google sign-in on this device, not a timer |
| `enrolled_at` | timestamptz | Set on first successful Google sign-in from this device |
| `last_seen_at` | timestamptz | Updated on each PIN or Google login |
| `last_login_location` | text, nullable | Informational only (e.g. city/IP-derived) — **new in v1.1.0**, not used for any access decision in M1 |
| `revoked_at` | timestamptz, nullable | Set when a store owner removes staff access (see `M1-franchise-model.md`/invite discussion) — a revoked device-member pairing can no longer complete PIN login even if the PIN itself hasn't expired |
| `deleted_at` | timestamptz, nullable | |

Constraint: `unique (device_id, member_id)` — one row per physical device per enrolled
member, so a shared shop tablet can have several members each with their own PIN.

---

## 2. Tenancy & Access

### `organizations`
Purpose: top-level billing/subscription entity — an independent owner, a chain owner,
or a franchisor are all just an `organization`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text | |
| `created_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `stores` (extends the existing table)
Purpose: a physical (or virtual) selling point.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | uuid, FK → `organizations.id`, not null | **New column added here** |
| `store_code` | text | Feeds invoice numbering (constitution §6) |
| `name` | text | |
| `created_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

GSTIN, address, and other business-registration fields are not yet speced — flagged as
TBD, likely M7 (Settings/onboarding) scope, not blocking M1.

### `memberships`
Purpose: who can act where, and as what role. The only mechanism that grants access to
an organization or store — never created by the act of signing in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `member_id` | uuid, FK → `members.id` | |
| `organization_id` | uuid, FK → `organizations.id`, nullable | |
| `store_id` | uuid, FK → `stores.id`, nullable | |
| `role` | text, check in (`owner`, `staff`) | |
| `created_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

Constraint: `organization_id is not null or store_id is not null`.

### `store_invitations`
Purpose: invite-gated onboarding — the only path that leads to a `memberships` row for
anyone other than the very first owner.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `store_id` | uuid, FK → `stores.id` | |
| `invited_email` | text | |
| `role` | text, check in (`owner`, `staff`) | |
| `token` | text, unique | Single-use invite link |
| `status` | text, check in (`pending`, `accepted`, `expired`, `revoked`), default `pending` | |
| `invited_by` | uuid, FK → `members.id` | |
| `expires_at` | timestamptz | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `access_grants`
Purpose: the one generic cross-tenant read primitive — Platform Owner access, a
franchisor's visibility into franchisees, and any future read-only party (accountant,
auditor) are all this same mechanism.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `grantee_member_id` | uuid, FK → `members.id` | |
| `scope_type` | text, check in (`organization`, `store`) | |
| `scope_id` | uuid | References either `organizations.id` or `stores.id` depending on `scope_type` |
| `permission` | text, check in (`read_only`, `reports_only`, `full`) | |
| `granted_by` | uuid, FK → `members.id` | |
| `expires_at` | timestamptz, nullable | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `channels`
Purpose: a store can sell through more than one channel. Only `pos` is used in Phase 1;
exists so Omnichannel (Phase 3) has somewhere to land later.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `store_id` | uuid, FK → `stores.id` | |
| `channel_type` | text, check in (`pos`, `online`) | Only `pos` populated in M1 |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

---

## 3. Stock Distribution

### `stock_locations`
Purpose: a central godown/warehouse that distributes stock to one or more stores.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | uuid, FK → `organizations.id` | |
| `name` | text | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `stock_transfers`
Purpose: header record of one stock movement from a location to a store. Used
identically by Chain (no payment implied) and Franchise (implies a settlement — see §4).
Line items live in a separate M3-scope table, not here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `stock_location_id` | uuid, FK → `stock_locations.id` | |
| `store_id` | uuid, FK → `stores.id` | |
| `transferred_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

---

## 4. Franchise & Settlement

### `franchise_groups`
Purpose: a franchisor brand/entity (e.g. Bandrip), distinct from any single store.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `franchisor_org_id` | uuid, FK → `organizations.id` | |
| `name` | text | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `franchise_memberships`
Purpose: links a specific store to a franchise group for a period of time. This table —
not a stored label — is what a store's derived business model (§5) checks.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `store_id` | uuid, FK → `stores.id` | |
| `franchise_group_id` | uuid, FK → `franchise_groups.id` | |
| `agreement_start` | date | |
| `agreement_end` | date, nullable | null = still active |
| `created_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `settlement_rules`
Purpose: one franchise agreement's terms, expressed as rule-engine configuration
(`M1-franchise-model.md` §4) — versioned by effective date so a renegotiated contract
never rewrites history.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `franchise_group_id` | uuid, FK → `franchise_groups.id` | |
| `config` | jsonb | Ordered list of rule-engine steps |
| `effective_from` | date | |
| `effective_to` | date, nullable | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

### `settlement_statements`
Purpose: the actual computed result for one store, one period — persisted, never
silently recomputed after issuance.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `store_id` | uuid, FK → `stores.id` | |
| `period_start` | date | |
| `period_end` | date | |
| `gross_revenue_paise` | bigint | Integer paise, per the existing money convention |
| `breakdown` | jsonb | Step-by-step results from the rule engine |
| `total_to_franchisor_paise` | bigint | |
| `store_net_paise` | bigint | |
| `computed_at` | timestamptz | |
| `last_modified_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | |

---

## 5. Companion view (not a table)

### `store_business_model`
A store's business model is derived, never stored — see `M1-core-tenancy-schema.md` §4
for the full view definition and rationale. Reads `franchise_memberships` and `stores`
grouped by `organization_id`; nothing above stores a `business_type` column anywhere.

---

## 6. Summary table

| Table | Purpose |
|---|---|
| `members` | Verified person identity (Google credentials, platform role) — no PIN state as of v1.1.0 |
| `devices` | Enrolled devices gating PIN login; PIN state now lives here, per device-and-member pair |
| `organizations` | Top-level billing entity |
| `stores` | A selling point (extended with `organization_id`) |
| `memberships` | Who can act where, and as what role |
| `store_invitations` | Invite-gated onboarding |
| `access_grants` | Generic cross-tenant read primitive |
| `channels` | Sales channel per store (`pos`/`online`) |
| `stock_locations` | A central godown/warehouse |
| `stock_transfers` | Header record of a stock movement |
| `franchise_groups` | A franchisor brand/entity |
| `franchise_memberships` | Store ↔ franchise-group link |
| `settlement_rules` | A franchise agreement's terms as configuration |
| `settlement_statements` | A computed, persisted monthly settlement |

---

## 7. Changelog

- **v1.1.0 (2026-08-21):** PIN fields moved from `members` to `devices` (per-device, not
  per-member, so a shared physical device can carry several enrolled staff members each
  with their own PIN). `devices.id` changed from client-generated to server-generated;
  added `devices.device_id` (the actual hardware identifier) and a
  `unique (device_id, member_id)` constraint. Added `devices.last_login_location`
  (informational). `M1a-identity-auth-task-spec.md` subtask 3 ("`members` table
  migration ... including the `pin_*` columns") is now superseded by this version — the
  PIN columns belong on the `devices` migration (Task 2, subtask 1) instead. Not yet
  reconciled into that task-spec doc's text; flagged here so it isn't missed when M1a
  work actually starts.
- **v1.0.0:** Initial consolidated reference (PIN on `members`, client-generated
  `devices.id`).
