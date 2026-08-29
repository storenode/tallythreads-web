-- Real RLS policies for the tables get-entitlements / admin-list-roles / admin-create-role /
-- admin-patch-role / admin-delete-role used to read and write with the service-role key.
-- Those five Edge Functions are being removed in favor of direct PostgREST (supabase-js
-- `.from()`) calls from the client, now that the legacy JWT secret matches APP_JWT_SECRET
-- (see 20260824000000_enable_rls_all_tables.sql) and PostgREST can verify our member JWTs.
-- Everything here replicates, as closely as possible, exactly what those functions already
-- allowed — this migration is a mechanical narrowing of "deny all" down to "what the removed
-- functions permitted", not a redesign of who can see what.

-- roles / permissions / role_permissions are small reference tables with no per-row
-- sensitivity (a role name, a permission key, which permissions a role grants) — every
-- Edge Function read them unfiltered, so any authenticated member may read them too.
create policy "authenticated can read roles" on roles
  for select to authenticated using (true);

create policy "authenticated can read permissions" on permissions
  for select to authenticated using (true);

create policy "authenticated can read role_permissions" on role_permissions
  for select to authenticated using (true);

-- get-entitlements read every store's (id, organization_id) unfiltered too — needed so
-- resolveEntitlements can cascade an org-scoped role down to that org's stores client-side.
-- Same shape of exposure as before (ids + org ids only, no store name/address), just via
-- RLS instead of a service-role read inside a function.
create policy "authenticated can read stores" on stores
  for select to authenticated using (true);

-- memberships is the one table that WAS scoped in the function (`.eq("member_id", memberId)`)
-- — a member may only read their own membership rows, active or soft-deleted alike (the
-- function didn't filter deleted_at; resolveEntitlements does that itself).
create policy "members can read own memberships" on memberships
  for select to authenticated using (member_id = auth.uid());

-- Mirrors supabase/functions/_shared/authz.ts's isPlatformAdmin(): true iff the calling
-- member (auth.uid(), which resolves to members.id — see src/lib/supabaseClient.ts) holds
-- an active platform_admin membership. security definer so it can read `memberships`/`roles`
-- on the caller's behalf even from inside a `roles` policy, without needing its own
-- memberships-select policy to already be in place for this check to work.
create or replace function public.is_platform_admin()
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
    where m.member_id = auth.uid()
      and m.deleted_at is null
      and r.name = 'platform_admin'
  );
$$;

comment on function public.is_platform_admin() is
  'True if the calling member (auth.uid()) holds an active platform_admin membership. '
  'Client-side counterpart of the removed admin-create-role/admin-patch-role/'
  'admin-delete-role Edge Functions'' isPlatformAdmin check — used in roles'' write policies.';

-- roles itself: platform-admin-only writes, same gate the three removed admin-*-role
-- functions each enforced in application code.
create policy "platform admins can insert roles" on roles
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform admins can update roles" on roles
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform admins can delete roles" on roles
  for delete to authenticated
  using (public.is_platform_admin());
