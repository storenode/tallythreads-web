-- hard_delete_organization: also purge warehouses, warehouse_stores, and warehouse-owned
-- stock_locations, so a demo/test org with stock rooms deletes traceless (same pattern as
-- purchase_* and store-owned stock_locations). See specs/roadmap/warehouses.md §6.
--
-- FKs already cascade (warehouse_stores/stock_locations -> warehouses -> organizations), but we
-- purge explicitly, before the stores/org delete, to report counts — matching the existing rows.

create or replace function public.hard_delete_organization(org_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_name text;
  v_store_ids uuid[];
  v_warehouse_ids uuid[];
  v_franchise_group_ids uuid[];
  v_trip_ids uuid[];
  v_member_ids uuid[];
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
  v_stock_locations_deleted int := 0;
  v_warehouse_stores_deleted int := 0;
  v_warehouses_deleted int := 0;
  v_members_deleted int := 0;
  v_devices_deleted int := 0;
  v_storage_deleted int := 0;
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
  select coalesce(array_agg(id), '{}') into v_warehouse_ids
    from warehouses where organization_id = org_id;
  select coalesce(array_agg(id), '{}') into v_franchise_group_ids
    from franchise_groups where franchisor_org_id = org_id;
  select coalesce(array_agg(id), '{}') into v_trip_ids
    from purchase_trips where organization_id = org_id;
  select coalesce(array_agg(distinct member_id), '{}') into v_member_ids
    from memberships where organization_id = org_id or store_id = any(v_store_ids);

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

  delete from purchase_invoice_items
    where invoice_id in (select id from purchase_invoices where trip_id = any(v_trip_ids));
  delete from trip_activities where trip_id = any(v_trip_ids);
  delete from trip_expenses where trip_id = any(v_trip_ids);
  delete from purchase_invoices where trip_id = any(v_trip_ids);
  delete from purchase_trips where organization_id = org_id;
  get diagnostics v_purchase_trips_deleted = row_count;

  -- Stock placement (M3): both store-owned and warehouse-owned rows for this org.
  delete from stock_locations
    where store_id = any(v_store_ids) or warehouse_id = any(v_warehouse_ids);
  get diagnostics v_stock_locations_deleted = row_count;

  -- Warehouses / stock rooms and their store attachments.
  delete from warehouse_stores where warehouse_id = any(v_warehouse_ids);
  get diagnostics v_warehouse_stores_deleted = row_count;

  delete from warehouses where organization_id = org_id;
  get diagnostics v_warehouses_deleted = row_count;

  delete from franchise_groups where franchisor_org_id = org_id;
  get diagnostics v_franchise_groups_deleted = row_count;

  delete from stores where organization_id = org_id;
  get diagnostics v_stores_deleted = row_count;

  delete from organizations where id = org_id;

  -- Orphaned members: devices first, then the members. Every NOT EXISTS keeps a member still
  -- referenced elsewhere; qa_test_cases.last_run_by is the QA-tracker's member FK.
  delete from devices d
   where d.member_id = any(v_member_ids)
     and not exists (select 1 from memberships x where x.member_id = d.member_id)
     and not exists (select 1 from access_grants x where x.grantee_member_id = d.member_id or x.granted_by = d.member_id)
     and not exists (select 1 from store_invitations x where x.invited_by = d.member_id)
     and not exists (select 1 from qa_test_cases x where x.last_run_by = d.member_id)
     and not exists (select 1 from purchase_trips x where x.created_by = d.member_id)
     and not exists (select 1 from trip_activities x where x.member_id = d.member_id)
     and not exists (select 1 from organizations x where x.primary_contact_member_id = d.member_id or x.onboarded_by = d.member_id);
  get diagnostics v_devices_deleted = row_count;

  delete from members mm
   where mm.id = any(v_member_ids)
     and not exists (select 1 from memberships x where x.member_id = mm.id)
     and not exists (select 1 from access_grants x where x.grantee_member_id = mm.id or x.granted_by = mm.id)
     and not exists (select 1 from store_invitations x where x.invited_by = mm.id)
     and not exists (select 1 from qa_test_cases x where x.last_run_by = mm.id)
     and not exists (select 1 from purchase_trips x where x.created_by = mm.id)
     and not exists (select 1 from trip_activities x where x.member_id = mm.id)
     and not exists (select 1 from organizations x where x.primary_contact_member_id = mm.id or x.onboarded_by = mm.id)
     and not exists (select 1 from devices x where x.member_id = mm.id);
  get diagnostics v_members_deleted = row_count;

  -- Storage: this org's receipts + logo and its stores' logos. Best-effort (non-fatal).
  begin
    delete from storage.objects
     where (bucket_id in ('receipts', 'org-logos')
            and (storage.foldername(name))[1] = org_id::text)
        or (bucket_id = 'store-logos'
            and (storage.foldername(name))[1] = any(v_store_ids::text[]));
    get diagnostics v_storage_deleted = row_count;
  exception when others then
    v_storage_deleted := -1;
  end;

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
    'purchase_trips_deleted', v_purchase_trips_deleted,
    'stock_locations_deleted', v_stock_locations_deleted,
    'warehouse_stores_deleted', v_warehouse_stores_deleted,
    'warehouses_deleted', v_warehouses_deleted,
    'members_deleted', v_members_deleted,
    'devices_deleted', v_devices_deleted,
    'storage_objects_deleted', v_storage_deleted
  );
end;
$function$;
