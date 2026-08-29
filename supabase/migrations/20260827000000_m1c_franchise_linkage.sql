-- M1c subtask 2: Franchise linkage — franchise_groups, franchise_memberships, and
-- settlement_rules become real schema, plus the store_business_model derived view
-- from M1-core-tenancy-schema.md §4. Pulled forward per constitution.md v1.8.0 §8's
-- 2026-08-27 entry, driven by needing a genuine franchisor/franchisee relationship
-- for a real demo organization ("Bandrip Demo") rather than a same-mechanism-as-chain
-- placeholder.
--
-- Scope: linkage + rule *storage* only. The settlement rule engine that actually
-- evaluates a settlement_rules.config against real revenue (M1d, lib/franchiseSettlement.ts)
-- is NOT part of this migration — a franchise-linked store has no automatic
-- royalty/settlement calculation as of this migration. See M1-franchise-model.md §4
-- for the rule-engine design this config shape is meant for, once M1d builds it.
--
-- franchisor_org_id deliberately has no constraint preventing it from equalling one of
-- its own linked stores' organization_id — a single organization can be its own
-- franchisor over its own multiple locations (an internal franchise structure), which
-- is exactly how "Bandrip Demo" is set up. This isn't a special case in the schema;
-- franchise_groups.franchisor_org_id is just "some organization," same as any other FK.

create table franchise_groups (
  id                uuid primary key default gen_random_uuid(),
  franchisor_org_id uuid not null references organizations(id),
  name              text not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table franchise_groups is
  'A franchisor brand/entity, distinct from any single store. franchisor_org_id is '
  'just an organization — it may be the same org that also owns the linked stores '
  '(an internal/self-franchised structure) or a separate one, the schema does not '
  'distinguish the two cases.';

create table franchise_memberships (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id),
  franchise_group_id  uuid not null references franchise_groups(id),
  agreement_start     date not null,
  agreement_end       date,
  created_at          timestamptz not null default now(),
  last_modified_at    timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table franchise_memberships is
  'Links a specific store to a franchise group for a period of time (agreement_end '
  'null = still active). This table, not a stored label, is what store_business_model '
  'below checks to decide whether a store is "franchise" — see M1-core-tenancy-schema.md §4.';

create index franchise_memberships_store_id_idx on franchise_memberships (store_id) where deleted_at is null;
create index franchise_memberships_franchise_group_id_idx on franchise_memberships (franchise_group_id) where deleted_at is null;

create table settlement_rules (
  id                  uuid primary key default gen_random_uuid(),
  franchise_group_id  uuid not null references franchise_groups(id),
  config              jsonb not null,
  effective_from      date not null,
  effective_to        date,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table settlement_rules is
  'One franchise agreement''s terms, as rule-engine configuration (M1-franchise-model.md '
  '§4), versioned by effective date so a renegotiated contract does not rewrite history. '
  'Storage only — nothing in this migration evaluates config against real revenue (M1d).';

create index settlement_rules_franchise_group_id_idx on settlement_rules (franchise_group_id) where deleted_at is null;

-- A store's business model is derived, never stored (constitution.md §2.IX / §6;
-- M1-core-tenancy-schema.md §4). Chain-vs-independent is derived purely from how many
-- stores share an organization_id; franchise overrides both once a franchise_memberships
-- row exists.
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

comment on view store_business_model is
  'A store''s business model (independent/chain/franchise), computed from its real '
  'relationships — never an editable column. See M1-core-tenancy-schema.md §4.';

-- RLS: platform_admin has full access everywhere (matches every other table's pattern,
-- is_platform_admin() from 20260826000000_roles_entitlements_rls_policies.sql). Read
-- access for everyone else is gated on the same 'settlement.read' permission org_owner
-- and org_accountant already hold (20260822090100_m1b_roles_permissions.sql) — the
-- financial-visibility bar for a franchise group's terms is the same one that already
-- exists for settlement statements in general, via has_org_permission()
-- (20260826000600_stores_create_rls.sql). No write policy for non-platform-admins yet:
-- there is no UI for org-level franchise management in this pass, so franchise linkage
-- is admin/SQL-orchestrated only, same as organization provisioning itself.

alter table franchise_groups enable row level security;
alter table franchise_memberships enable row level security;
alter table settlement_rules enable row level security;

create policy "platform admins have full access to franchise_groups"
  on franchise_groups for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "org members with settlement.read can view their franchise_groups"
  on franchise_groups for select
  using (has_org_permission(franchisor_org_id, 'settlement.read'));

create policy "platform admins have full access to franchise_memberships"
  on franchise_memberships for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "org members with settlement.read can view their franchise_memberships"
  on franchise_memberships for select
  using (
    exists (
      select 1 from franchise_groups fg
      where fg.id = franchise_memberships.franchise_group_id
        and has_org_permission(fg.franchisor_org_id, 'settlement.read')
    )
  );

create policy "platform admins have full access to settlement_rules"
  on settlement_rules for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "org members with settlement.read can view their settlement_rules"
  on settlement_rules for select
  using (
    exists (
      select 1 from franchise_groups fg
      where fg.id = settlement_rules.franchise_group_id
        and has_org_permission(fg.franchisor_org_id, 'settlement.read')
    )
  );
