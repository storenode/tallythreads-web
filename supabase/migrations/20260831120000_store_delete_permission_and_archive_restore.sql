-- Splits "delete-shaped" store actions (archive + hard delete) off from store.edit,
-- per explicit scoping for this pass: store deletion (soft or hard) is
-- platform_admin or org_owner only. org_manager keeps store.edit (rename, update
-- address/contact/GSTIN/hours — see 20260831110000) but loses the ability to
-- archive, restore, or permanently delete a store.
--
-- RLS can't restrict a single column (deleted_at) differently from the rest of a
-- row on the same UPDATE policy, so archive/restore move off the plain client
-- update that store.edit's UPDATE policy backed until now, onto two new
-- security-definer RPCs — archive_store()/restore_store() — mirroring
-- hard_delete_store()'s existing pattern (20260831080000). The store.edit UPDATE
-- policy's WITH CHECK gains one clause forbidding deleted_at from moving through it
-- at all, so an org_manager's ordinary edit calls (still a plain client update) can
-- no longer smuggle an archive/restore through the back door — only the two RPCs,
-- which run as security definer and bypass RLS, can touch that column now.
--
-- restore_store() is new scope, not previously planned: archiving a store used to
-- be a dead end in the UI (no way to undo it), which became worth fixing in the same
-- pass since archive was already being turned into an RPC for the permission split.

insert into permissions (key, module) values
  ('store.delete', 'Tenancy')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'store.delete'
where r.name = 'org_owner'
on conflict do nothing;

-- Lock deleted_at out of the general store.edit UPDATE path.
drop policy "platform admins or store.edit members can update stores" on stores;

create policy "platform admins or store.edit members can update stores" on stores
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.edit')
  )
  with check (
    (
      public.is_platform_admin()
      or public.has_org_permission(organization_id, 'store.edit')
    )
    and deleted_at is not distinct from stores.deleted_at
  );

-- Defense-in-depth DELETE policy — widened to match hard_delete_store()'s own check
-- below; the real delete path is still the RPC, not a raw client delete.
drop policy "platform admins can delete stores" on stores;

create policy "platform admins or store.delete members can delete stores" on stores
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.delete')
  );

create or replace function public.archive_store(store_id uuid)
returns stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_result stores;
begin
  select organization_id into v_org_id
  from stores where id = archive_store.store_id;

  if v_org_id is null then
    raise exception 'Store % not found', store_id;
  end if;

  if not (
    public.is_platform_admin()
    or public.has_org_permission(v_org_id, 'store.delete')
  ) then
    raise exception 'Not authorized to archive this store';
  end if;

  update stores
  set deleted_at = now(), last_modified_at = now()
  where id = archive_store.store_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.archive_store(uuid) from public;
grant execute on function public.archive_store(uuid) to authenticated;

comment on function public.archive_store(uuid) is
  'Soft-deletes a store (sets deleted_at). Authorized for is_platform_admin() OR '
  'store.delete (org_owner only) — NOT store.edit, unlike the rest of the stores '
  'UPDATE surface (see the WITH CHECK on the stores UPDATE policy, same migration). '
  'Counterpart: restore_store().';

create or replace function public.restore_store(store_id uuid)
returns stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_result stores;
begin
  select organization_id into v_org_id
  from stores where id = restore_store.store_id;

  if v_org_id is null then
    raise exception 'Store % not found', store_id;
  end if;

  if not (
    public.is_platform_admin()
    or public.has_org_permission(v_org_id, 'store.delete')
  ) then
    raise exception 'Not authorized to restore this store';
  end if;

  update stores
  set deleted_at = null, last_modified_at = now()
  where id = restore_store.store_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.restore_store(uuid) from public;
grant execute on function public.restore_store(uuid) to authenticated;

comment on function public.restore_store(uuid) is
  'Un-archives a store (clears deleted_at). Same store.delete/platform_admin gate as '
  'archive_store().';

-- hard_delete_store(): widen from platform-admin-only to also accept org_owner
-- (store.delete), same gate as archive/restore above. Body is otherwise unchanged
-- from 20260831080000 — only the authorization check and the v_org_id lookup it
-- needs are new.
create or replace function public.hard_delete_store(store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_name text;
  v_org_id uuid;
  v_channels_deleted int;
  v_franchise_memberships_deleted int;
  v_store_invitations_deleted int;
  v_memberships_deleted int;
  v_access_grants_deleted int;
begin
  select name, organization_id into v_store_name, v_org_id
  from stores where id = hard_delete_store.store_id;

  if v_store_name is null then
    raise exception 'Store % not found', store_id;
  end if;

  if not (
    public.is_platform_admin()
    or public.has_org_permission(v_org_id, 'store.delete')
  ) then
    raise exception 'Not authorized to hard-delete this store';
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
  'Authorized for is_platform_admin() OR store.delete (org_owner) — widened in '
  'v1.5.0 from platform-admin-only, same gate as archive_store()/restore_store(). '
  'Does NOT touch franchise_groups/settlement_rules (those hang off the '
  'organization, never a single store) or the organization itself. members are '
  'never deleted, only this store''s membership links. Unlike the soft-delete '
  '(archive) path, this cannot be undone.';

revoke all on function public.hard_delete_store(uuid) from public;
grant execute on function public.hard_delete_store(uuid) to authenticated;
