-- One-off: sweep the traces left by the earlier (pre-fix) Bandrip demo-org deletions.
-- The org/store/trip data was already removed; what lingered was orphaned member
-- placeholders and Storage objects (the old hard_delete_organization kept members and never
-- touched Storage — fixed in 20260909020000). Idempotent: re-running finds nothing.

-- 1. Orphaned Bandrip member placeholders (demo email domain) with no references anywhere —
--    devices first, then the members. Same guards as the RPC.
delete from devices d
  using members mm
 where d.member_id = mm.id
   and mm.google_email ilike '%@bandrip.example.in'
   and not exists (select 1 from memberships x where x.member_id = mm.id)
   and not exists (select 1 from access_grants x where x.grantee_member_id = mm.id or x.granted_by = mm.id)
   and not exists (select 1 from store_invitations x where x.invited_by = mm.id)
   and not exists (select 1 from qa_test_cases x where x.last_run_by = mm.id)
   and not exists (select 1 from purchase_trips x where x.created_by = mm.id)
   and not exists (select 1 from trip_activities x where x.member_id = mm.id)
   and not exists (select 1 from organizations x where x.primary_contact_member_id = mm.id or x.onboarded_by = mm.id);

delete from members mm
 where mm.google_email ilike '%@bandrip.example.in'
   and not exists (select 1 from memberships x where x.member_id = mm.id)
   and not exists (select 1 from access_grants x where x.grantee_member_id = mm.id or x.granted_by = mm.id)
   and not exists (select 1 from store_invitations x where x.invited_by = mm.id)
   and not exists (select 1 from qa_test_cases x where x.last_run_by = mm.id)
   and not exists (select 1 from purchase_trips x where x.created_by = mm.id)
   and not exists (select 1 from trip_activities x where x.member_id = mm.id)
   and not exists (select 1 from organizations x where x.primary_contact_member_id = mm.id or x.onboarded_by = mm.id)
   and not exists (select 1 from devices x where x.member_id = mm.id);

-- 2. Orphaned Storage objects whose owning org/store no longer exists (any deleted demo,
--    not just Bandrip). Best-effort — a Storage permissions error must not fail the migration.
do $$
begin
  delete from storage.objects
   where bucket_id in ('receipts', 'org-logos')
     and not exists (
       select 1 from organizations o where o.id::text = (storage.foldername(name))[1]
     );
  delete from storage.objects
   where bucket_id = 'store-logos'
     and not exists (
       select 1 from stores s where s.id::text = (storage.foldername(name))[1]
     );
exception when others then
  raise notice 'Storage orphan sweep skipped (%).', sqlerrm;
end $$;
