-- ============================================================================
-- seed/_manual_reset.sql — wipe all tenancy data, keep schema + seeded roles
-- ============================================================================
-- NOT run automatically. Deliberately excluded from config.toml's sql_paths so
-- a stray `supabase db reset` can never reach it on a hosted project.
--
-- Keeps: roles, permissions, role_permissions (migration-owned reference data —
-- wiping these breaks every RLS policy and every has_org_permission() call).
--
--   !! CONFIRM YOUR CONNECTION STRING BEFORE RUNNING !!
--
-- ALWAYS run seed/10_platform_admin.sql immediately after this. This truncate
-- empties memberships, which means nobody is platform_admin and there is no UI
-- path back into the admin console until that seed re-grants it.
-- ============================================================================

begin;

truncate table
  public.channels,
  public.access_grants,
  public.store_invitations,
  public.memberships,
  public.devices,
  public.franchise_memberships,
  public.settlement_rules,
  public.franchise_groups,
  public.demo_scenarios,
  public.qa_test_cases,
  public.stores,
  public.organizations,
  public.members
restart identity cascade;

commit;

-- Not live schema yet (M1c/M3) — uncomment when those migrations land:
-- truncate table public.stock_transfers, public.stock_locations,
--                public.settlement_statements restart identity cascade;

-- Storage: org logos are orphaned by the truncate above. The row delete below
-- does not reliably purge the backing file — prefer the Storage UI or the JS
-- client for a real cleanup.
-- delete from storage.objects where bucket_id = 'org-logos';

-- auth.users is NOT touched. public.members is the real identity store; your
-- Google identity survives and re-activates the seeded placeholder on next
-- sign-in. Only clear auth.users if you want every device re-enrolled from zero.
--
-- deletes the 4 orphaned auth identities; cascades to identities/sessions
-- delete from auth.users u
-- where not exists (
--   select 1 from public.members m where lower(m.google_email) = lower(u.email)
-- );

-- Verify: expect 0 everywhere except roles / permissions / role_permissions.
select t.tablename,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', t.tablename),
                           false, true, '')))[1]::text::bigint as row_count
from pg_tables t
where t.schemaname = 'public'
order by row_count desc, t.tablename;
