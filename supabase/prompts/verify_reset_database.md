Verify the database state after a full data reset. READ-ONLY — do not modify any
file, migration, or database row. Report findings only.

CONTEXT
I just ran, in this order:

1. supabase/seed/\_manual_reset.sql (truncated all tenancy data)
2. supabase/seed/10_platform_admin.sql (bootstrapped platform_admin)

Supabase project ref: gmmeaplomgotqtivevkg (named "tallythreads")

REFERENCE MATERIAL — read these before querying anything

- supabase/schema.mmd the visual ERD (Mermaid; also embedded in specs/reference/schema.md)
- supabase/migrations/\*.sql the actual source of truth for live schema
- specs/reference/schema.md consolidated table reference (verified against the live DB)
- specs/reference/roles-and-permissions.md the role/permission matrix

Where the diagram or the docs disagree with the migrations, THE MIGRATIONS WIN.
Report every such disagreement as schema drift — that is one of the things I
want out of this pass.

CHECKS

1. Table inventory
   List every table in schema public. Expected: 16. For each, say whether it
   appears in supabase/schema.mmd. Flag both directions:
   - tables that exist live but are missing from the diagram
   - tables drawn in the diagram that were never migrated
     (I expect stock_locations, stock_transfers, settlement_statements to be
     documented-but-not-live — confirm, don't assume)

2. Row counts
   Count rows in all 16 tables. Expected:
   members = 1 (tallythreads.hq@gmail.com)
   memberships = 1 (platform_admin, platform scope)
   roles > 0 (untouched reference data)
   permissions > 0 (untouched reference data)
   role_permissions > 0 (untouched reference data)
   everything else = 0
   Any nonzero count outside that list means the truncate missed a table.
   Any zero in roles/permissions/role_permissions is a serious problem — report
   it loudly, it means RLS has nothing left to authorize against.

3. Reference data integrity
   List all rows in roles (name, scope_type, is_system) and all permission keys.
   Reconcile against the seed migrations (20260822090100, 20260826000800,
   20260830050000, and the store.edit / store.delete migrations). Report any
   role or permission the migrations create but the DB is missing, and any
   role_permissions row pointing at a role or permission that no longer exists.

4. The platform_admin grant
   Confirm exactly one live platform_admin membership resolves:
   - members row for tallythreads.hq@gmail.com exists, deleted_at is null
   - before first sign-in it should be a PLACEHOLDER: google_id null,
     is_active false — that is correct, not a bug
   - its memberships row has organization_id null AND store_id null
     (platform scope) and deleted_at null
     Then confirm there is exactly ONE members row for that email — a second row
     would mean the seed's email-based dedup failed.

5. RLS
   Confirm row level security is enabled on all 16 tables, and list the policies
   on each. Flag any table with RLS on but zero policies — that table is
   unreadable by everyone, which after a reset looks identical to "no data".

6. Functions
   Confirm these exist and are SECURITY DEFINER:
   provision_organization_with_contacts, invite_organization_member,
   invite_store_member, accept_pending_invitations, hard_delete_organization,
   hard_delete_store, archive_store, restore_store, has_org_permission,
   has_store_permission, is_platform_admin
   Report any that are missing or not security definer.

7. Orphans and leftovers
   - any row in any table whose FK points at a now-deleted parent
   - objects still in the org-logos storage bucket (their organizations rows are
     gone, so any remaining file is orphaned)
   - rows in auth.users with no matching public.members row (expected after a
     reset — I want the list, not a fix)

OUTPUT
A single markdown table: Check | Expected | Actual | PASS/FAIL, then a short
"Problems found" section with the specific SQL or migration that explains each
failure. If everything passes, say so plainly in one line. Do not propose or
make any fix without asking me first.
