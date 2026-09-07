-- Bootstrap the platform admin: tallythreads.hq@gmail.com.
--
-- Why a migration (not just seed/10_platform_admin.sql): the seed file is run by hand
-- after a reset, but the live DB needs this grant applied now via `db push`, and the
-- founder had already signed in with tallythreads.hq@gmail.com — which created an
-- ACTIVATED members row (google_id set) with NO platform_admin membership, routing them
-- to /no-store. This runs the seed's exact idempotent logic so that member gets the grant.
--
-- Mirrors seed/10_platform_admin.sql: idempotent by EMAIL, prefers an already-activated
-- row over a placeholder, revives a revoked grant instead of stacking a duplicate. Safe on
-- every environment — on a fresh DB it just creates the placeholder admin.

do $$
declare
  _email     text := 'tallythreads.hq@gmail.com';
  _member_id uuid;
  _role_id   uuid;
begin
  select id into _role_id from roles where name = 'platform_admin';
  if _role_id is null then
    raise exception
      'platform_admin role not found. Run the roles/permissions migrations first.';
  end if;

  -- Prefer an already-activated member (google_id set) over a placeholder.
  select id into _member_id
  from members
  where lower(google_email) = lower(_email)
    and deleted_at is null
  order by (google_id is not null) desc, created_at asc
  limit 1;

  if _member_id is null then
    _member_id := '10000000-0000-0000-0000-000000000002';
    insert into members (
      id, google_id, google_email, email_verified, is_active,
      first_name, last_name, locale
    ) values (
      _member_id, null, _email, false, false, 'Platform', 'Admin', 'en'
    );
    raise notice 'Created placeholder admin member % for %', _member_id, _email;
  else
    raise notice 'Found existing member % for %', _member_id, _email;
  end if;

  -- Revive a revoked platform_admin membership rather than duplicating it.
  update memberships
     set deleted_at = null, last_modified_at = now()
   where member_id = _member_id and role_id = _role_id
     and organization_id is null and store_id is null
     and deleted_at is not null;

  -- Grant if not already granted (no unique constraint on this shape).
  if not exists (
    select 1 from memberships
    where member_id = _member_id and role_id = _role_id
      and organization_id is null and store_id is null and deleted_at is null
  ) then
    insert into memberships (member_id, role_id, organization_id, store_id)
    values (_member_id, _role_id, null, null);
    raise notice 'Granted platform_admin to %.', _email;
  else
    raise notice 'platform_admin already granted to % — nothing to do.', _email;
  end if;
end $$;
