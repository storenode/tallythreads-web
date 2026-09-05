-- ============================================================================
-- seed/10_platform_admin.sql — bootstrap the platform admin
-- ============================================================================
-- The ONLY thing this seed does: make sure storenode.hq@gmail.com can sign in
-- and land as platform_admin. Everything else — organizations, stores, members,
-- franchise links — gets created through the app, because creating it through
-- the app is the test.
--
-- Run this after every reset. Without it, a data wipe locks you out of your own
-- admin console: memberships is the only thing that grants access, so with zero
-- rows in it nobody is an admin and there is no UI path back in.
--
-- HOW IT WORKS
-- The member is inserted as a PLACEHOLDER: google_id null, is_active false.
-- On first Google sign-in, mint-member-session looks for exactly that shape —
-- google_id is null AND google_email ilike <signed-in email> — and activates
-- the row IN PLACE, keeping its id. So the platform_admin membership created
-- here survives sign-in and attaches to the real, activated identity.
--
-- Safe to re-run. Idempotent by EMAIL, not by id, so running it again after
-- you have already signed in will not create a second row for the same person
-- — it finds the activated member and just re-asserts the membership.
-- ============================================================================

do $$
declare
  -- Change this to whichever Google account should hold platform_admin.
  _email     text := 'storenode.hq@gmail.com';

  _member_id uuid;
  _role_id   uuid;
  _revived   integer := 0;
begin
  ----------------------------------------------------------------------------
  -- 1. The platform_admin role is migration-owned reference data. If it is
  --    missing, migrations have not run (or roles got truncated by mistake) —
  --    fail loudly rather than silently seeding nothing.
  ----------------------------------------------------------------------------
  select id into _role_id from roles where name = 'platform_admin';

  if _role_id is null then
    raise exception
      'platform_admin role not found. Run migrations first, and do not truncate roles/permissions/role_permissions.';
  end if;

  ----------------------------------------------------------------------------
  -- 2. Find an existing member for this email, preferring an already-activated
  --    row (google_id set) over a placeholder, so a second run after sign-in
  --    attaches to the real identity instead of a stale placeholder.
  ----------------------------------------------------------------------------
  select id into _member_id
  from members
  where lower(google_email) = lower(_email)
    and deleted_at is null
  order by (google_id is not null) desc, created_at asc
  limit 1;

  if _member_id is null then
    _member_id := '10000000-0000-0000-0000-000000000001';

    insert into members (
      id, google_id, google_email, email_verified, is_active,
      first_name, last_name, locale
    ) values (
      _member_id, null, _email, false, false,
      'Platform', 'Admin', 'en'
    );

    raise notice 'Created placeholder member % for %', _member_id, _email;
  else
    raise notice 'Reusing existing member % for %', _member_id, _email;
  end if;

  ----------------------------------------------------------------------------
  -- 3. Revive a previously revoked platform_admin membership if there is one,
  --    rather than stacking a duplicate row next to it.
  ----------------------------------------------------------------------------
  update memberships
     set deleted_at = null,
         last_modified_at = now()
   where member_id = _member_id
     and role_id = _role_id
     and organization_id is null
     and store_id is null
     and deleted_at is not null;

  get diagnostics _revived = row_count;

  if _revived > 0 then
    raise notice 'Revived % revoked platform_admin membership row(s).', _revived;
  end if;

  ----------------------------------------------------------------------------
  -- 4. Grant platform_admin. Platform scope => organization_id and store_id
  --    are both null. No unique constraint exists on this shape, so guard the
  --    insert with a not-exists check instead of on conflict.
  ----------------------------------------------------------------------------
  if not exists (
    select 1 from memberships
    where member_id = _member_id
      and role_id = _role_id
      and organization_id is null
      and store_id is null
      and deleted_at is null
  ) then
    insert into memberships (member_id, role_id, organization_id, store_id)
    values (_member_id, _role_id, null, null);

    raise notice 'Granted platform_admin to %.', _email;
  else
    raise notice 'platform_admin already granted to % — nothing to do.', _email;
  end if;
end $$;


-- ============================================================================
-- Verify. Expect exactly one row.
--   is_active / google_id null before first sign-in  -> correct, it is a placeholder
--   is_active true, google_id set after sign-in      -> activated in place, same id
-- ============================================================================

select
  m.id            as member_id,
  m.google_email,
  m.google_id is not null as activated,
  m.is_active,
  r.name          as role,
  r.scope_type,
  ms.organization_id,
  ms.store_id
from memberships ms
join members m on m.id = ms.member_id
join roles   r on r.id = ms.role_id
where r.name = 'platform_admin'
  and ms.deleted_at is null
  and m.deleted_at is null;
