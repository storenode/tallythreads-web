-- Store counterpart of hard_delete_organization() (20260830020000/020100) — backs
-- the store edit page's Danger Zone "Delete permanently" action. Platform-admin
-- only (2026-08-30 scoping decision, same posture as the org-level hard delete).
--
-- Cascade order (leaf-most first), scoped to this one store rather than a whole
-- org's stores: channels, franchise_memberships (this store's own franchise link,
-- NOT the franchise_groups it might belong to as franchisor — a store is never a
-- franchisor itself, only franchise_memberships.store_id can reference it),
-- store_invitations, memberships, then access_grants (scope_type = 'store', no
-- real FK so this is an application-level match, same caveat as
-- hard_delete_organization). franchise_groups/settlement_rules are NOT touched —
-- those hang off organizations.id (franchisor_org_id), never off a single store,
-- so deleting one store must never cascade into them.

create or replace function public.hard_delete_store(store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_name text;
  v_channels_deleted int;
  v_franchise_memberships_deleted int;
  v_store_invitations_deleted int;
  v_memberships_deleted int;
  v_access_grants_deleted int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can hard-delete a store';
  end if;

  select name into v_store_name from stores where id = store_id;
  if v_store_name is null then
    raise exception 'Store % not found', store_id;
  end if;

  delete from channels where store_id = hard_delete_store.store_id;
  get diagnostics v_channels_deleted = row_count;

  delete from franchise_memberships where store_id = hard_delete_store.store_id;
  get diagnostics v_franchise_memberships_deleted = row_count;

  delete from store_invitations where store_id = hard_delete_store.store_id;
  get diagnostics v_store_invitations_deleted = row_count;

  delete from memberships where store_id = hard_delete_store.store_id;
  get diagnostics v_memberships_deleted = row_count;

  delete from access_grants
    where scope_type = 'store' and scope_id = hard_delete_store.store_id;
  get diagnostics v_access_grants_deleted = row_count;

  delete from stores where id = hard_delete_store.store_id;

  return jsonb_build_object(
    'store_name', v_store_name,
    'channels_deleted', v_channels_deleted,
    'franchise_memberships_deleted', v_franchise_memberships_deleted,
    'store_invitations_deleted', v_store_invitations_deleted,
    'memberships_deleted', v_memberships_deleted,
    'access_grants_deleted', v_access_grants_deleted
  );
end;
$$;

comment on function public.hard_delete_store(uuid) is
  'Permanently purges a single store and its footprint (channels, its own '
  'franchise_memberships row if any, store_invitations, memberships, access_grants). '
  'Platform-admin only. Does NOT touch franchise_groups/settlement_rules (those hang '
  'off the organization, never a single store) or the organization itself. members '
  'are never deleted, only this store''s membership links. Unlike the soft-delete '
  '(archive) path, this cannot be undone.';

revoke all on function public.hard_delete_store(uuid) from public;
grant execute on function public.hard_delete_store(uuid) to authenticated;
