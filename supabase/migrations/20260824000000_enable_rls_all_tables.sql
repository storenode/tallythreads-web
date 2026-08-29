-- Emergency lockdown: enable RLS (no policies yet = deny-all to anon/authenticated) on
-- every table that had none. Until now this didn't matter because PostgREST rejected our
-- custom member JWT outright (see get-entitlements/index.ts's comment) — no legacy JWT
-- secret was configured. That secret was just set to match our APP_JWT_SECRET, so
-- PostgREST now verifies our tokens, which means every RLS-less table below became
-- directly readable/writable by any signed-in member the moment that change took effect.
--
-- This is a stopgap: deny-all via RLS-with-no-policies, not real per-table policies.
-- Every Edge Function keeps working unchanged (they use the service-role key, which
-- bypasses RLS). Direct REST reads (e.g. fetchRoles) will now fail until a real policy is
-- added deliberately per table, on purpose, one at a time.

alter table organizations enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table stores enable row level security;
alter table memberships enable row level security;
alter table store_invitations enable row level security;
alter table channels enable row level security;
alter table access_grants enable row level security;
