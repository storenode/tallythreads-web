-- Restores the "Invite Member" action that existed pre-schema-rework (see
-- M-admin-org-module.md's OrgMembersTable/inviteOrgMember description) — adding one
-- more person to an *already-existing* organization, as opposed to
-- provision_organization_with_contacts()'s up-to-3-invites-at-creation-time path.
--
-- Email→member resolution has to happen server-side (an already-active member by
-- email must win over creating a duplicate placeholder), so this can't be a plain
-- client insert the way most other post-creation edits are — same reasoning that
-- made provision_organization_with_contacts() itself a security-definer function.
-- This mirrors that function's resolution order exactly rather than inventing a new
-- one, and is deliberately factored out as its own function (not a shared internal
-- helper both call) to keep this migration a pure addition with no risk to the
-- already-working creation path.

create or replace function public.invite_organization_member(
  target_org_id uuid,
  invite_email text,
  invite_role_name text,
  invite_is_primary_contact boolean default false
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
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can invite an organization member';
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

revoke all on function public.invite_organization_member(uuid, text, text, boolean) from public;
grant execute on function public.invite_organization_member(uuid, text, text, boolean) to authenticated;

comment on function public.invite_organization_member(uuid, text, text, boolean) is
  'Invites one additional person into an already-existing organization: resolves the '
  'email to an existing active member, an existing placeholder, or a newly-created '
  'placeholder (mirrors provision_organization_with_contacts()''s resolution order '
  'exactly), inserts the memberships row if one does not already exist, and optionally '
  'sets organizations.primary_contact_member_id. Platform-admin only. Returns a jsonb '
  'summary — {member_id, email, role_name, already_member, is_placeholder} — so the '
  'client can show "already a member" instead of a false-positive success message.';