-- Backs the new "edit member" flow: clicking a member's email in the org Members
-- card or the store Members grid now opens an edit page instead of doing nothing
-- (there was previously no way to fix a typo'd Aadhaar number or update a mobile
-- number after the fact). Deliberately a separate function from
-- invite_organization_member()/invite_store_member() rather than a shared one,
-- because the write semantics differ: invite's profile-field params use
-- coalesce(new, existing) — "backfill if blank, never clobber" — which is correct at
-- invite time (you don't want a second inviter blanking out fields the first invite
-- already set). An edit form has the opposite intent: every field is pre-filled with
-- the current value, so a field left blank on submit means the person actually wants
-- it cleared, not "unknown, don't touch." So this function does a plain `set`, not
-- coalesce, on every profile field.
--
-- Parameter names deliberately reuse the `invite_*` prefix from the invite RPCs
-- (not renamed to `new_*`/`edit_*`) purely so the client can reuse the exact same
-- memberProfileRpcParams() mapping helper for both invite and edit calls — this
-- function's own behavior (plain overwrite) is what actually differs, not the shape
-- of its parameters.
--
-- Does NOT allow editing google_email or the member's role — those are separate,
-- more delicate actions (email is the dedup/identity key; role changes swap which
-- memberships row exists, not a members-table field) and out of scope here.
--
-- Authorization mirrors whichever invite RPC created this kind of membership: exactly
-- one of target_org_id/target_store_id must be given, the target member must actually
-- hold an active membership in that scope (defends against editing an unrelated
-- member id), and the caller must be platform_admin OR hold org.manage_members
-- (org-scoped) / staff.invite on the store's parent org (store-scoped) — the same
-- gates invite_organization_member()/invite_store_member() use.

create or replace function public.update_member_profile(
  target_member_id uuid,
  target_org_id uuid default null,
  target_store_id uuid default null,
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
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized boolean := false;
  v_store_org_id uuid;
  v_result members;
begin
  if (target_org_id is null) = (target_store_id is null) then
    raise exception 'Provide exactly one of target_org_id or target_store_id';
  end if;

  if target_org_id is not null then
    if not exists (
      select 1 from memberships
      where member_id = target_member_id
        and organization_id = target_org_id
        and deleted_at is null
    ) then
      raise exception 'Member is not part of this organization';
    end if;
    v_authorized := public.is_platform_admin()
      or public.has_org_permission(target_org_id, 'org.manage_members');
  else
    select organization_id into v_store_org_id
    from stores where id = target_store_id and deleted_at is null;

    if v_store_org_id is null then
      raise exception 'Store % not found', target_store_id;
    end if;

    if not exists (
      select 1 from memberships
      where member_id = target_member_id
        and store_id = target_store_id
        and deleted_at is null
    ) then
      raise exception 'Member is not part of this store';
    end if;

    v_authorized := public.is_platform_admin()
      or public.has_org_permission(v_store_org_id, 'staff.invite');
  end if;

  if not v_authorized then
    raise exception 'Not authorized to edit this member';
  end if;

  update members
  set
    first_name = invite_first_name,
    last_name = invite_last_name,
    mobile_number = invite_mobile_number,
    aadhaar_number = invite_aadhaar_number,
    pan_number = invite_pan_number,
    date_of_joining = invite_date_of_joining,
    emergency_contact_name = invite_emergency_contact_name,
    emergency_contact_phone = invite_emergency_contact_phone,
    address_line1 = invite_address_line1,
    address_line2 = invite_address_line2,
    city = invite_city,
    state = invite_state,
    pincode = invite_pincode,
    last_modified_at = now()
  where id = target_member_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.update_member_profile(
  uuid, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, text
) from public;
grant execute on function public.update_member_profile(
  uuid, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, text
) to authenticated;

comment on function public.update_member_profile(
  uuid, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, text
) is
  'Edits an existing member''s profile fields (identity/contact/emergency-contact/'
  'employment/address) — a plain overwrite (including clearing to null), not the '
  'coalesce-based backfill invite_organization_member()/invite_store_member() use. '
  'Exactly one of target_org_id/target_store_id scopes the edit; the target member '
  'must hold an active membership in that scope. Authorized for is_platform_admin() '
  'OR org.manage_members (org-scoped) / staff.invite on the store''s parent org '
  '(store-scoped). Does not touch google_email or role. Returns the updated members row.';
