-- Security fix: store-level memberships were treated as org-level ones.
--
-- Store memberships carry the store's organization_id too (invite_store_member sets both), and
-- the "org-level" branches of has_store_permission() and has_org_permission() matched on
-- organization_id alone. So every store employee got their store role's permissions in EVERY
-- store of the org (verified live 2026-09-28: a Kadapa sales person could read all 38 stock
-- locations and all 8 categories of the org — and write them, via inventory.write — instead of
-- their own store's). The fix: an org-level membership is one with store_id IS NULL.
--
-- Verified before applying (rolled-back dry run, RLS as each member): the org owner's
-- visibility is unchanged on every table; the store employee's drops to their own store.
-- The one legitimate cross-scope read the leak was masking — store staff reading the stock rooms
-- attached to their store — gets an explicit policy below.

create or replace function public.has_org_permission(target_organization_id uuid, permission_key text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1
    from memberships m
    join roles r on r.id = m.role_id
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where m.member_id = auth.uid()
      and m.organization_id = target_organization_id
      and m.store_id is null            -- org-level membership only
      and m.deleted_at is null
      and p.key = permission_key
  );
$function$;

create or replace function public.has_store_permission(target_store_id uuid, permission_key text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select
    exists (
      -- direct store-level membership
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where m.member_id = auth.uid()
        and m.store_id = target_store_id
        and m.deleted_at is null
        and p.key = permission_key
    )
    or exists (
      -- org-level membership on the store's parent org (the org_owner/org_manager cascade)
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      join stores s on s.id = target_store_id
      where m.member_id = auth.uid()
        and m.organization_id = s.organization_id
        and m.store_id is null          -- org-level membership only
        and m.deleted_at is null
        and p.key = permission_key
    );
$function$;

-- Store staff may read the stock rooms attached to their store (the Store Inventory page shows
-- them). A SECURITY DEFINER helper avoids RLS recursion: warehouse_stores' own read policy
-- looks up warehouses.
create or replace function public.warehouse_serves_readable_store(p_warehouse_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from warehouse_stores ws
    where ws.warehouse_id = p_warehouse_id
      and ws.deleted_at is null
      and has_store_permission(ws.store_id, 'inventory.read')
  );
$$;
revoke execute on function public.warehouse_serves_readable_store(uuid) from public, anon;
grant execute on function public.warehouse_serves_readable_store(uuid) to authenticated;

create policy "attached-store staff can read warehouses" on public.warehouses
  for select to authenticated
  using (public.warehouse_serves_readable_store(id));
