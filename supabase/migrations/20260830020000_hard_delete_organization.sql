-- Fixes a real gap in hard_delete_organization() (20260830020000): it never touched
-- demo_scenarios, whose organization_id is `not null references organizations(id)`
-- with no ON DELETE clause. Since the whole function is one atomic block, any org with
-- a demo_scenarios row (exactly the kind of org "Delete permanently" exists for — demo
-- orgs like "Bandrip Demo" carry investor-walkthrough content) would hit an FK
-- violation on the final `delete from organizations` and roll back everything: nothing
-- deleted, no error surfaced beyond a failed RPC call. qa_test_cases is unaffected —
-- confirmed global/not org-scoped, no organization_id column at all.
--
-- `create or replace function` is idempotent, so this is a full redefinition rather
-- than a patch — Postgres has no partial-alter for function bodies.

create or replace function public.hard_delete_organization(org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_name text;
  v_store_ids uuid[];
  v_franchise_group_ids uuid[];
  v_channels_deleted int;
  v_franchise_memberships_deleted int;
  v_settlement_rules_deleted int;
  v_access_grants_deleted int;
  v_store_invitations_deleted int;
  v_memberships_deleted int;
  v_franchise_groups_deleted int;
  v_stores_deleted int;
  v_demo_scenarios_deleted int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can hard-delete an organization';
  end if;

  select name into v_org_name from organizations where id = org_id;
  if v_org_name is null then
    raise exception 'Organization % not found', org_id;
  end if;

  select coalesce(array_agg(id), '{}') into v_store_ids
    from stores where organization_id = org_id;

  select coalesce(array_agg(id), '{}') into v_franchise_group_ids
    from franchise_groups where franchisor_org_id = org_id;

  -- Leaf-most first: anything referencing this org's stores and/or the
  -- franchise_groups it owns as franchisor.
  delete from channels where store_id = any(v_store_ids);
  get diagnostics v_channels_deleted = row_count;

  delete from franchise_memberships
    where store_id = any(v_store_ids) or franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_franchise_memberships_deleted = row_count;

  delete from settlement_rules where franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_settlement_rules_deleted = row_count;

  -- access_grants.scope_id has no real FK (it targets either organizations or
  -- stores depending on scope_type), so this is an application-level match, not
  -- something the DB would otherwise enforce.
  delete from access_grants
    where (scope_type = 'organization' and scope_id = org_id)
       or (scope_type = 'store' and scope_id = any(v_store_ids));
  get diagnostics v_access_grants_deleted = row_count;

  delete from store_invitations
    where organization_id = org_id or store_id = any(v_store_ids);
  get diagnostics v_store_invitations_deleted = row_count;

  delete from memberships
    where organization_id = org_id or store_id = any(v_store_ids);
  get diagnostics v_memberships_deleted = row_count;

  -- Demo module content (20260829000000_demo_scenarios_qa_tracker.sql) — investor
  -- walkthrough narratives attached directly to the org. qa_test_cases is global
  -- (no organization_id column), so it needs no cleanup here.
  delete from demo_scenarios where organization_id = org_id;
  get diagnostics v_demo_scenarios_deleted = row_count;

  delete from franchise_groups where franchisor_org_id = org_id;
  get diagnostics v_franchise_groups_deleted = row_count;

  delete from stores where organization_id = org_id;
  get diagnostics v_stores_deleted = row_count;

  delete from organizations where id = org_id;

  return jsonb_build_object(
    'organization_name', v_org_name,
    'stores_deleted', v_stores_deleted,
    'channels_deleted', v_channels_deleted,
    'memberships_deleted', v_memberships_deleted,
    'store_invitations_deleted', v_store_invitations_deleted,
    'access_grants_deleted', v_access_grants_deleted,
    'franchise_groups_deleted', v_franchise_groups_deleted,
    'franchise_memberships_deleted', v_franchise_memberships_deleted,
    'settlement_rules_deleted', v_settlement_rules_deleted,
    'demo_scenarios_deleted', v_demo_scenarios_deleted
  );
end;
$$;

comment on function public.hard_delete_organization(uuid) is
  'Permanently purges an organization and its entire live footprint (stores, '
  'memberships, store_invitations, channels, access_grants, demo_scenarios, and any '
  'franchise_groups it owns plus their franchise_memberships/settlement_rules). '
  'Platform-admin only. Unlike the soft-delete path (a plain UPDATE ... SET deleted_at), '
  'this cannot be undone. members are never deleted, only this org''s membership links '
  '— an invited-but-never-signed-in placeholder member row can be left behind '
  'intentionally; see organizations.ts.';

revoke all on function public.hard_delete_organization(uuid) from public;
grant execute on function public.hard_delete_organization(uuid) to authenticated;