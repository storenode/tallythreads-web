-- New store-scoped counterpart of invite_organization_member() — backs the
-- "Add member" button on the store edit page's Members grid. Mirrors that
-- function's structure (email resolution order, profile-field backfill via
-- coalesce) but targets a store role and a store-scoped memberships row instead
-- of an org one. No is_primary_contact concept here — stores have no equivalent
-- of organizations.primary_contact_member_id.
--
-- Authorization: is_platform_admin() OR has_org_permission(store's parent org,
-- 'staff.invite') — staff.invite is already granted to org_owner/org_manager
-- (20260822090100), and per M-role-permission-model.md an org_owner/org_manager
-- can staff any store in their own org, not just ones they hold a separate
-- store-level row on (the same cascade has_store_permission() encodes). A plain
-- store_manager has no staff.invite grant yet (seed migration 20260830050000
-- deliberately withheld it pending a real store-scoped invite feature) — this IS
-- that feature, but extending store_manager's own grants is a role_permissions
-- change for a later pass, not this migration.
--
-- The created membership row sets both store_id and organization_id (the store's
-- parent org) — unlike store_invitations-driven memberships (which leave
-- organization_id null for a store-scoped invite, see accept_pending_invitations),
-- setting it here keeps entitlements.ts's store rows carrying a real
-- organizationId with no extra client-side lookup required.

create or replace function public.invite_store_member(
  target_store_id uuid,
  invite_email text,
  invite_role_name text,
  invite_first_name text default null,
  invite_last_name text default null,
  invite_mobile_number text default null,
  invite_aadhaar_number text default null,
  invite_pan_number text default null,
  invite_date_of_joining date default null,
  invite_emergency_contact_name text default null,
  invite_emergency_contact_phone text default null,
  invite_address_line1 text default null,
  invite_address_line2 text default null,
  invite_city text default null,
  invite_state text default null,
  invite_pincode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_org_id uuid;
  v_email text;
  v_role_id uuid;
  v_member_id uuid;
  v_already_member boolean := false;
  v_is_placeholder boolean;
begin
  select id, organization_id into v_store_id, v_org_id
  from stores
  where id = target_store_id and deleted_at is null;

  if v_store_id is null then
    raise exception 'Store % not found', target_store_id;
  end if;

  if not (
    public.is_platform_admin()
    or public.has_org_permission(v_org_id, 'staff.invite')
  ) then
    raise exception 'Not authorized to invite a member into this store';
  end if;

  v_email := lower(trim(invite_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address: %', invite_email;
  end if;

  select id into v_role_id
  from roles
  where name = invite_role_name and scope_type = 'store';

  if v_role_id is null then
    raise exception 'Unknown store role: %', invite_role_name;
  end if;

  select id into v_member_id
  from members
  where lower(google_email) = v_email
    and deleted_at is null
  order by (google_id is not null) desc
  limit 1;

  if v_member_id is null then
    insert into members (google_id, google_email, is_active)
    values (null, v_email, false)
    returning id into v_member_id;
  end if;

  select (google_id is null) into v_is_placeholder from members where id = v_member_id;

  update members
  set
    first_name = coalesce(invite_first_name, first_name),
    last_name = coalesce(invite_last_name, last_name),
    mobile_number = coalesce(invite_mobile_number, mobile_number),
    aadhaar_number = coalesce(invite_aadhaar_number, aadhaar_number),
    pan_number = coalesce(invite_pan_number, pan_number),
    date_of_joining = coalesce(invite_date_of_joining, date_of_joining),
    emergency_contact_name = coalesce(invite_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = coalesce(invite_emergency_contact_phone, emergency_contact_phone),
    address_line1 = coalesce(invite_address_line1, address_line1),
    address_line2 = coalesce(invite_address_line2, address_line2),
    city = coalesce(invite_city, city),
    state = coalesce(invite_state, state),
    pincode = coalesce(invite_pincode, pincode),
    last_modified_at = now()
  where id = v_member_id;

  if exists (
    select 1 from memberships
    where member_id = v_member_id
      and role_id = v_role_id
      and store_id = target_store_id
      and deleted_at is null
  ) then
    v_already_member := true;
  else
    insert into memberships (member_id, role_id, organization_id, store_id)
    values (v_member_id, v_role_id, v_org_id, target_store_id);
  end if;

  return jsonb_build_object(
    'member_id', v_member_id,
    'email', v_email,
    'role_name', invite_role_name,
    'already_member', v_already_member,
    'is_placeholder', v_is_placeholder
  );
end;
$$;

revoke all on function public.invite_store_member(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) from public;
grant execute on function public.invite_store_member(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) to authenticated;

comment on function public.invite_store_member(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) is
  'Store-scoped counterpart of invite_organization_member(): resolves the email to '
  'an existing/placeholder member, backfills profile fields (coalesce), and inserts '
  'a store-scoped memberships row (organization_id set to the store''s parent org, '
  'store_id set to target_store_id) if one does not already exist. Authorized for '
  'platform_admin or a caller with staff.invite on the store''s parent org — no '
  'is_primary_contact concept, stores have none. Returns the same jsonb summary '
  'shape as invite_organization_member().';
