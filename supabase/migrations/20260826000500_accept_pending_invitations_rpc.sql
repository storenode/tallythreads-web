-- The accept-invite flow, deliberately left out of 20260826000200/300/400 ("Invited
-- members reading/accepting their own pending invitation is deliberately out of scope
-- here — that's the accept-flow follow-up, not this pass"). There's also no
-- /invite/:token route yet (OrgFormPage's post-create screen says as much), so in
-- practice an invited person's actual path in is: sign up/sign in with Google using
-- the email they were invited at, same as anyone else. This function is what turns
-- that plain sign-in into real access — matching store_invitations' own table comment
-- ("the only path that creates a memberships row for anyone other than the very first
-- admin-provisioned contact").
--
-- Built as a security-definer Postgres function rather than sequential client writes
-- (the pattern createOrganizationWithInvites/commitOrgMemberRemovals use elsewhere)
-- because this is the one place that gap actually matters: insert-membership and
-- mark-invitation-accepted have to succeed or fail together, and — unlike an admin
-- action — there's no is_platform_admin() to gate a couple of new client-writable RLS
-- policies on instead. auth.uid() is read from inside the function, not passed in, so
-- a member can only ever accept invitations addressed to their own signed-in email —
-- nothing for the client to spoof. Same reasoning, and the same "owns the tables it
-- touches, so RLS doesn't apply inside it" mechanism, as is_platform_admin() from
-- 20260826000000_roles_entitlements_rls_policies.sql.

create or replace function public.accept_pending_invitations()
returns setof memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  inv record;
  new_membership memberships;
begin
  select google_email into caller_email
  from members
  where id = auth.uid() and deleted_at is null;

  if caller_email is null then
    return; -- not a real signed-in member row (shouldn't happen for an authenticated caller)
  end if;

  for inv in
    select *
    from store_invitations
    where lower(invited_email) = lower(caller_email)
      and status = 'pending'
      and deleted_at is null
      and expires_at > now()
    order by created_at
    for update
  loop
    -- Defensive: skip if a matching active membership somehow already exists (e.g. a
    -- retry after a prior partial run) rather than inserting a duplicate.
    if not exists (
      select 1 from memberships
      where member_id = auth.uid()
        and role_id = inv.role_id
        and organization_id is not distinct from inv.organization_id
        and store_id is not distinct from inv.store_id
        and deleted_at is null
    ) then
      insert into memberships (member_id, role_id, organization_id, store_id)
      values (auth.uid(), inv.role_id, inv.organization_id, inv.store_id)
      returning * into new_membership;
      return next new_membership;
    end if;

    update store_invitations
    set status = 'accepted'
    where id = inv.id;
  end loop;

  return;
end;
$$;

comment on function public.accept_pending_invitations() is
  'Converts every pending, unexpired store_invitations row addressed to the calling '
  'member''s own email into a real memberships row, and marks each accepted. Safe to '
  'call repeatedly (idempotent — already-accepted rows are no longer pending, so a '
  'second call is a no-op). Called from resolvePostSignInPath.ts on every sign-in and '
  'from NoStoreAssignedPage.tsx on mount, so an already-signed-in member with a '
  'newly-issued invitation picks it up without having to sign out and back in.';

-- Postgres grants EXECUTE on a new function to PUBLIC by default; narrow that down to
-- authenticated (this is called directly from the client via supabase.rpc(), unlike
-- is_platform_admin() which is only ever invoked from inside other policies).
revoke all on function public.accept_pending_invitations() from public;
grant execute on function public.accept_pending_invitations() to authenticated;
