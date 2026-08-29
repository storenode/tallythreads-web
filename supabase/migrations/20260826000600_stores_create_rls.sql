-- Store creation, decided this pass as org_owner-only (not org_owner+org_manager, the
-- pair 20260822090100_m1b_roles_permissions.sql originally seeded store.create for).
-- Two parts: bring role_permissions in line with that decision, then a generic
-- has_org_permission() RLS check — the org-scope counterpart of is_platform_admin()
-- (20260826000000) — rather than hardcoding "org_owner" into the stores policy
-- itself, so this stays consistent with the permission-key model
-- resolveEntitlements/hasPermission (entitlements.ts, M1b §4) already uses
-- client-side, and any future re-grant is a role_permissions change, not a migration.

delete from role_permissions rp
using roles r, permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.name = 'org_manager'
  and p.key = 'store.create';

create or replace function public.has_org_permission(
  target_organization_id uuid,
  permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships m
    join roles r on r.id = m.role_id
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where m.member_id = auth.uid()
      and m.organization_id = target_organization_id
      and m.deleted_at is null
      and p.key = permission_key
  );
$$;

comment on function public.has_org_permission(uuid, text) is
  'True if the calling member (auth.uid()) holds an active org-scoped membership in '
  'target_organization_id whose role grants permission_key, per role_permissions. The '
  'general org-scope counterpart of is_platform_admin() — lets RLS policies gate on '
  'the same permission-key model entitlements.ts resolves client-side, instead of '
  'hardcoding a role name into each new policy. Currently only resolves true for '
  'org_owner + store.create (the one grant that exists in role_permissions right now), '
  'but works unmodified for whatever other org-scoped permission checks come next.';

revoke all on function public.has_org_permission(uuid, text) from public;
grant execute on function public.has_org_permission(uuid, text) to authenticated;

-- Stores: platform admins (same universal-write posture as every other table this
-- session) or a member whose org-scoped role grants store.create in THIS store's org.
create policy "platform admins or org.store.create members can insert stores" on stores
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.has_org_permission(organization_id, 'store.create')
  );

-- No new SELECT policy needed: "authenticated can read stores" from
-- 20260826000000_roles_entitlements_rls_policies.sql already grants every
-- authenticated member read access to every store row (chosen there for the
-- entitlements org-cascade, not introduced by this migration) — it also covers the
-- new /org/:orgId/stores list.
