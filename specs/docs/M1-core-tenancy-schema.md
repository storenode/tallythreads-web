# M1-core-tenancy-schema — Organizations, Stores, Memberships, Access Grants, Stock Distribution

**Status:** Draft, ready for implementation prep
**Parent docs:** `constitution.md` v1.2.0, `store-model-master-plan.md`, `M1-auth-google.md`, `M1-franchise-model.md`
**Version:** 1.0.0

---

## 0. What this is

The shared tenancy skeleton underneath all three Phase 1 store models — Independent,
Multi-store/chain, and Franchise (constitution §2.IX). The central design decision: a
store's business model is **derived from its relationships, never stored as an editable
label** (§4). That single choice is what makes Chain and Franchise buildable together
without duplicated logic, and what makes a future business-model change safe to add
later without a schema rewrite — even though no UI for that change is being built now
(founder decision, 2026-08-21).

---

## 1. Scope

**In scope:** `organizations`, `stores` (extended), `memberships`, `store_invitations`,
`access_grants`, `channels`, `stock_locations`/`stock_transfers`, `franchise_groups`/
`franchise_memberships` (the linkage tables only).

**Out of scope:** the settlement rule engine and `settlement_statements` (fully speced in
`M1-franchise-model.md`), any UI/workflow for converting a store's business model
(deliberately deferred, §4), Wholesale/Omnichannel (still-deferred models).

---

## 2. Tables

```sql
-- Top-level billing/subscription entity. An independent owner, a chain owner, and a
-- franchisor are all just an organization.
create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Existing `stores` table gains one column: which organization owns it.
alter table stores add column organization_id uuid not null references organizations(id);

-- Who can act where, and as what. Replaces any earlier "store_members" sketch —
-- a membership can be organization-scoped (rare — e.g. an org-wide admin) or
-- store-scoped (the common case: an owner or staff member tied to one store).
create table memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id),
  organization_id   uuid references organizations(id),
  store_id          uuid references stores(id),
  role              text not null check (role in ('owner', 'staff')),
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz,
  check (organization_id is not null or store_id is not null)
);

-- Invite-gated onboarding (from the earlier auth design) — a membership is only
-- ever created via an accepted invitation, never by the act of signing in.
create table store_invitations (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id),
  invited_email     text not null,
  role              text not null check (role in ('owner', 'staff')),
  token             text not null unique,
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by        uuid not null references members(id),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- The generic cross-tenant read primitive — Platform Owner access, a franchisor's
-- visibility into franchisees, and any future read-only party (accountant, auditor)
-- are all this same mechanism, never a bespoke feature per relationship.
create table access_grants (
  id                uuid primary key default gen_random_uuid(),
  grantee_member_id uuid not null references members(id),
  scope_type        text not null check (scope_type in ('organization', 'store')),
  scope_id          uuid not null,
  permission        text not null check (permission in ('read_only', 'reports_only', 'full')),
  granted_by        uuid not null references members(id),
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- A store can sell through more than one channel. Only `pos` is used in Phase 1;
-- this exists so Omnichannel (Phase 3) has somewhere to land later without a new table.
create table channels (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id),
  channel_type      text not null check (channel_type in ('pos', 'online')),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- A central stock point (a godown/warehouse) distributing to one or more stores.
-- Used identically by Chain (internal transfer, no payment implied) and Franchise
-- (the same transfer also implies a settlement — see M1-franchise-model.md).
create table stock_locations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),
  name              text not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table stock_transfers (
  id                  uuid primary key default gen_random_uuid(),
  stock_location_id   uuid not null references stock_locations(id),
  store_id            uuid not null references stores(id),
  transferred_at       timestamptz not null default now(),
  -- line items live in a separate stock_transfer_items table (M3's concern);
  -- this table is the header record only.
  last_modified_at    timestamptz not null default now(),
  deleted_at          timestamptz
);

-- Franchise linkage (settlement engine itself: M1-franchise-model.md)
create table franchise_groups (
  id                uuid primary key default gen_random_uuid(),
  franchisor_org_id uuid not null references organizations(id),
  name              text not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table franchise_memberships (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id),
  franchise_group_id  uuid not null references franchise_groups(id),
  agreement_start     date not null,
  agreement_end       date,             -- null = still active
  created_at          timestamptz not null default now(),
  last_modified_at    timestamptz not null default now(),
  deleted_at          timestamptz
);
```

All tables follow the existing conventions: soft delete only (`deleted_at`), no hard
deletes, `last_modified_at` for LWW where relevant.

---

## 3. Registration flow

At store registration, the owner picks a starting business model — Independent, Chain
(joining an existing organization), or Franchise (also selecting a `franchise_group`).
That choice only determines **which setup steps run** (whether to prompt for a
franchise-group link and settlement configuration, or just create the store under a new
or existing organization) — it is never written anywhere as a stored field. The
resulting rows (`stores`, `memberships`, optionally `franchise_memberships`) are the only
record of what was chosen.

---

## 4. Business model is derived, never stored

No `business_type` column exists anywhere in this schema, on purpose. A store's current
model is computed from its relationships:

```sql
create or replace view store_business_model as
select
  s.id as store_id,
  case
    when fm.id is not null then 'franchise'
    when chain_counts.store_count > 1 then 'chain'
    else 'independent'
  end as business_model
from stores s
left join franchise_memberships fm
  on fm.store_id = s.id
  and fm.deleted_at is null
  and (fm.agreement_end is null or fm.agreement_end >= current_date)
left join (
  select organization_id, count(*) as store_count
  from stores
  where deleted_at is null
  group by organization_id
) chain_counts on chain_counts.organization_id = s.organization_id
where s.deleted_at is null;
```

This is why the "what if a store's model needs to change later" question doesn't need a
separate design: a second store added to the same organization flips a store's derived
result from `independent` to `chain` automatically; a new `franchise_memberships` row
flips it to `franchise`; closing that row (`agreement_end`) flips it back — all without
touching this schema again. **No workflow for triggering these changes is being built in
Phase 1** (founder decision, 2026-08-21) — only the guarantee that the schema doesn't
block building one later, whichever shape it eventually takes (seamless in-place
conversion, or force-close-and-reopen).

One consequence worth being deliberate about: every place that decides behavior by
business model — which settlement rules apply, whether Purchase-Trip or
goods-received-from-franchisor is offered, what a franchisor's `access_grants` cover —
must query this view (or the underlying tables), never a cached label. If a
denormalized/cached column is ever added later purely for UI list-rendering speed, it
must be written only by a trigger or application code path tied to the same relationship
changes above — never edited independently by a user or admin. That's precisely the
failure mode this design avoids: a label and the real settlement/access state silently
disagreeing.

---

## 5. Definition of Done

- [ ] Schema migrates cleanly; `store_business_model` view returns the correct result
      for fixtures covering all three Phase 1 scenarios
- [ ] Adding a second store to an organization flips an existing store's derived result
      from `independent` to `chain` with no code change beyond the insert
- [ ] Creating a `franchise_memberships` row flips a store's derived result to
      `franchise`; setting `agreement_end` flips it back — both with no code change
- [ ] RLS policies (design pass tracked separately) consult `memberships`/`access_grants`/
      `franchise_memberships` directly — never a cached business-model label
- [ ] `store_invitations` acceptance is the only path that creates a `memberships` row —
      signing in with Google alone never grants store access (carried over from the
      earlier invite-gating design)

---

## 6. Open questions

1. Should a denormalized `business_model` column be added later purely for list-view
   query performance? If so, it must be trigger-maintained, never independently
   editable — see §4.
2. `channels` currently has no `pos` row auto-created per store — decide whether store
   creation should insert one by default, or whether its absence should just be treated
   as "assume `pos`" everywhere it's read.
3. Full RLS policy design (who can read/write what, expressed against these tables) is
   tracked as a separate task, not covered here.
