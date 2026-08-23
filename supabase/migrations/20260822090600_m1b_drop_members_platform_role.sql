-- M1b Phase 1, subtask 7: cleanup — drop members.platform_role.
--
-- Superseded by memberships rows carrying the platform_admin role (see M1b §1's
-- rework note and Task 0's bootstrap seed). platform_role was always null on every
-- real row — the two known platform admins were seeded directly into memberships,
-- never through this column.
--
-- Do NOT deploy this migration in the same push as the rest of Phase 1. Apply only
-- after Task 0's bootstrap seed has run and both known platform-admin accounts are
-- confirmed to resolve a platform_admin memberships row (M1b §3 Definition of Done).

alter table members drop column platform_role;
