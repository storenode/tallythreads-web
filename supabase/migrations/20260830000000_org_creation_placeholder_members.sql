-- Members: allow a placeholder row to exist before a real Google sign-in ever happens.
-- google_id stays the unique identity anchor for real, activated members — Postgres
-- unique indexes already treat multiple NULLs as non-conflicting, so
-- members_google_id_idx (from 20260820001601_create_members.sql) needs no change to
-- allow several simultaneous placeholder rows.
alter table members alter column google_id drop not null;
alter table members add column is_active boolean not null default true;

-- Existing rows are all real, already-signed-in members — default true is correct for
-- them. New placeholder rows explicitly pass false (see the function below).

comment on column members.is_active is
  'false for a placeholder row created by an org invite before that person has ever '
  'signed in with Google. Flips to true the moment mint-member-session activates it. '
  'Informational only — never gates RLS/access; a placeholder cannot obtain a JWT at '
  'all until a real Google sign-in activates it, so there is nothing to separately gate.';

-- Case-insensitive email lookups (both here and in mint-member-session) need this —
-- the existing members_google_email_idx is a plain-value index, not expression-based.
create index members_google_email_lower_idx on members (lower(google_email)) where deleted_at is null;

-- Organizations: the full registration/profile field set.
alter table organizations
  add column registration_type text check (registration_type in ('independent', 'chain', 'franchise')),
  add column legal_name text,
  add column legal_entity_type text check (legal_entity_type in ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf', 'other')),
  add column gstin text,
  add column pan text,
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column state text,
  add column pincode text,
  add column country text default 'India',
  add column primary_contact_phone text,
  add column primary_contact_member_id uuid references members(id),
  add column website text,
  add column logo_url text,
  add column financial_year_start_month smallint default 4 check (financial_year_start_month between 1 and 12),
  add column preferred_language text,
  add column status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'churned')),
  add column onboarded_by uuid references members(id),
  add column notes text,
  add column is_demo boolean not null default false;

comment on column organizations.status is
  'Admin bookkeeping only — not wired into any RLS/login/access logic. No billing '
  'system exists yet to drive this automatically.';

comment on column organizations.registration_type is
  'Declared intent at registration time, editable directly by a platform admin (no '
  'approval workflow — deferred, see constitution.md). This is NOT the same as the '
  'derived store_business_model view (M1-core-tenancy-schema.md §4), which remains '
  'the only source of truth for real permission/settlement/purchase-trip logic. '
  'Setting this to franchise does not itself create a franchise_memberships row — '
  'that linkage is a separate, deliberate step.';

-- Provisions an organization plus its invited Owner/Manager/Accountant contacts in one
-- transaction. Security-definer (same pattern as accept_pending_invitations()) rather
-- than direct RLS-gated client writes — chosen because a partial failure here (org
-- created, but only some invited members correctly resolved) is a real data-integrity
-- risk, not just an inconvenience; see this migration's own history for why the
-- original org-creation design used direct client writes and why that no longer holds
-- once members/memberships are written directly instead of via store_invitations.
create or replace function public.provision_organization_with_contacts(
  org_name text,
  org_registration_type text,
  org_is_demo boolean,
  invites jsonb  -- array of {email, role_name, is_primary_contact}
)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org organizations;
  invite jsonb;
  invited_email text;
  invited_role_name text;
  invited_is_primary boolean;
  role_id_val uuid;
  member_id_val uuid;
  primary_contact_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can provision an organization';
  end if;

  if org_registration_type not in ('independent', 'chain', 'franchise') then
    raise exception 'Invalid registration_type: %', org_registration_type;
  end if;

  insert into organizations (name, registration_type, is_demo)
  values (org_name, org_registration_type, coalesce(org_is_demo, false))
  returning * into new_org;

  for invite in select * from jsonb_array_elements(invites)
  loop
    invited_email := lower(trim(invite->>'email'));
    invited_role_name := invite->>'role_name';
    invited_is_primary := coalesce((invite->>'is_primary_contact')::boolean, false);

    select id into role_id_val
    from roles
    where name = invited_role_name and scope_type = 'organization';

    if role_id_val is null then
      raise exception 'Unknown organization role: %', invited_role_name;
    end if;

    -- Resolve to a single members row: an already-active member with this email wins
    -- over a placeholder, so inviting someone who already has a real account elsewhere
    -- never creates a duplicate identity. Only create a new placeholder if neither exists.
    select id into member_id_val
    from members
    where lower(google_email) = invited_email
      and deleted_at is null
    order by (google_id is not null) desc
    limit 1;

    if member_id_val is null then
      insert into members (google_id, google_email, is_active)
      values (null, invited_email, false)
      returning id into member_id_val;
    end if;

    if not exists (
      select 1 from memberships
      where member_id = member_id_val
        and role_id = role_id_val
        and organization_id = new_org.id
        and deleted_at is null
    ) then
      insert into memberships (member_id, role_id, organization_id)
      values (member_id_val, role_id_val, new_org.id);
    end if;

    if invited_is_primary then
      primary_contact_id := member_id_val;
    end if;
  end loop;

  if primary_contact_id is not null then
    update organizations
    set primary_contact_member_id = primary_contact_id
    where id = new_org.id
    returning * into new_org;
  end if;

  return new_org;
end;
$$;

revoke all on function public.provision_organization_with_contacts(text, text, boolean, jsonb) from public;
grant execute on function public.provision_organization_with_contacts(text, text, boolean, jsonb) to authenticated;

comment on function public.provision_organization_with_contacts is
  'Creates an organization and its invited Owner/Manager/Accountant contacts in one '
  'transaction, reusing an existing active or placeholder members row by email rather '
  'than ever creating a duplicate identity. Replaces store_invitations for '
  'organization-level invites only — store-level staff invites are untouched, still '
  'built on store_invitations, a separate not-yet-built feature.';