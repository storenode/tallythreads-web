-- Two fixes to invite_organization_member() (20260830030000), both surfaced while
-- building the new org-scoped Add Member page:
--
-- 1. Real bug: its own guard was `if not is_platform_admin() then raise exception`,
--    despite the permission matrix granting staff.invite to org_owner/org_manager
--    and org.manage_members specifically existing to gate this action
--    (M-role-permission-model.md). An org_owner using the new "Add member" button
--    would have hit this exception. Fixed to the same
--    "is_platform_admin() OR has_org_permission(...)" composition used everywhere
--    else in this schema (has_org_permission itself, the organizations/stores RLS
--    policies from 20260831010000/20260826000600).
--
-- 2. Extends the RPC to accept and persist the new members profile fields
--    (20260831030000) — the new member-creation page collects all of them in one
--    step ("person + role together", per the 2026-08-31 UX decision), so this is
--    the single write path for both. New params are all optional (default null),
--    appended after the existing ones so this stays additive. Values are applied
--    with coalesce(new, existing) rather than a blind overwrite, so re-inviting an
--    already-existing member (the "already_member" branch) backfills any fields
--    left blank on the form without clobbering data that member already had.
--
-- Signature changed (new trailing params), so the old 4-arg overload is dropped
-- explicitly first — `create or replace` only replaces a function with the exact
-- same argument type list; a differing one creates a second overload instead of
-- replacing, which is not what we want here.

drop function if exists public.invite_organization_member(uuid, text, text, boolean);

create or replace function public.invite_organization_member(
  target_org_id uuid,
  invite_email text,
  invite_role_name text,
  invite_is_primary_contact boolean default false,
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
  v_org_id uuid;
  v_email text;
  v_role_id uuid;
  v_member_id uuid;
  v_already_member boolean := false;
  v_is_placeholder boolean;
begin
  if not (
    public.is_platform_admin()
    or public.has_org_permission(target_org_id, 'org.manage_members')
  ) then
    raise exception 'Not authorized to invite a member into this organization';
  end if;

  select id into v_org_id from organizations where id = target_org_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'Organization % not found', target_org_id;
  end if;

  v_email := lower(trim(invite_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address: %', invite_email;
  end if;

  select id into v_role_id
  from roles
  where name = invite_role_name and scope_type = 'organization';

  if v_role_id is null then
    raise exception 'Unknown organization role: %', invite_role_name;
  end if;

  -- Same resolution order as provision_organization_with_contacts(): an already-active
  -- member with this email wins over a placeholder, so inviting someone who already
  -- has a real account elsewhere never creates a duplicate identity.
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

  -- Backfill profile fields — never clobber a value already on the row with a blank
  -- one from this form.
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
      and organization_id = target_org_id
      and deleted_at is null
  ) then
    v_already_member := true;
  else
    insert into memberships (member_id, role_id, organization_id)
    values (v_member_id, v_role_id, target_org_id);
  end if;

  if invite_is_primary_contact then
    update organizations
    set primary_contact_member_id = v_member_id, last_modified_at = now()
    where id = target_org_id;
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

revoke all on function public.invite_organization_member(
  uuid, text, text, boolean, text, text, text, text, text, date, text, text, text, text, text, text, text
) from public;
grant execute on function public.invite_organization_member(
  uuid, text, text, boolean, text, text, text, text, text, date, text, text, text, text, text, text, text
) to authenticated;

comment on function public.invite_organization_member(
  uuid, text, text, boolean, text, text, text, text, text, date, text, text, text, text, text, text, text
) is
  'Invites one additional person into an already-existing organization: resolves the '
  'email to an existing active member, an existing placeholder, or a newly-created '
  'placeholder, backfills the members profile fields (coalesce — never clobbers an '
  'existing value with a blank one), inserts the memberships row if one does not '
  'already exist, and optionally sets organizations.primary_contact_member_id. '
  'Platform-admin OR org.manage_members holder on target_org_id. Returns a jsonb '
  'summary — {member_id, email, role_name, already_member, is_placeholder}.';
