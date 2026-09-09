-- Fix the delete ORDER inside hard_delete_organization() for the Purchase-Trip block.
--
-- 20260908010000 deleted purchase_invoices before trip_activities, but
-- trip_activities.ref_invoice_id references purchase_invoices(id)
-- (20260906010000_m4_active_phase.sql), so an org with any receipt-scan/invoice activity
-- would 23503 on the invoices delete. Correct leaf-most order:
--   invoice_items → trip_activities → trip_expenses → invoices → trips
-- (items and activities both reference invoices, so they go first; expenses and invoices
-- reference trips; trips reference the org).
--
-- Full redefinition (no partial-alter for function bodies).

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
  v_trip_ids uuid[];
  v_channels_deleted int;
  v_franchise_memberships_deleted int;
  v_settlement_rules_deleted int;
  v_access_grants_deleted int;
  v_store_invitations_deleted int;
  v_memberships_deleted int;
  v_franchise_groups_deleted int;
  v_stores_deleted int;
  v_demo_scenarios_deleted int;
  v_purchase_trips_deleted int;
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

  select coalesce(array_agg(id), '{}') into v_trip_ids
    from purchase_trips where organization_id = org_id;

  delete from channels where store_id = any(v_store_ids);
  get diagnostics v_channels_deleted = row_count;

  delete from franchise_memberships
    where store_id = any(v_store_ids) or franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_franchise_memberships_deleted = row_count;

  delete from settlement_rules where franchise_group_id = any(v_franchise_group_ids);
  get diagnostics v_settlement_rules_deleted = row_count;

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

  delete from demo_scenarios where organization_id = org_id;
  get diagnostics v_demo_scenarios_deleted = row_count;

  -- Purchase Trips (M4), leaf-most order. Both invoice_items and trip_activities
  -- reference purchase_invoices, so they must go before the invoices; expenses and
  -- invoices reference the trips.
  delete from purchase_invoice_items
    where invoice_id in (select id from purchase_invoices where trip_id = any(v_trip_ids));
  delete from trip_activities where trip_id = any(v_trip_ids);
  delete from trip_expenses where trip_id = any(v_trip_ids);
  delete from purchase_invoices where trip_id = any(v_trip_ids);
  delete from purchase_trips where organization_id = org_id;
  get diagnostics v_purchase_trips_deleted = row_count;

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
    'demo_scenarios_deleted', v_demo_scenarios_deleted,
    'purchase_trips_deleted', v_purchase_trips_deleted
  );
end;
$$;

revoke all on function public.hard_delete_organization(uuid) from public;
grant execute on function public.hard_delete_organization(uuid) to authenticated;
