-- Extends the Demo Data admin module (src/features/admin/demo/) with two more
-- founder-only tools, per the 2026-08-29 conversation:
--
-- 1. demo_scenarios — a short authored narrative (headline, problem, solution,
--    an ordered click-through walkthrough) attached to a demo organization, meant
--    to be pulled up live or shared as a link when presenting the product to
--    investors. Content lives here, not hardcoded anywhere — the founder writes it
--    from the Demo module. Deliberately NOT customer-facing: no org-member read
--    policy at all, platform_admin only, same as the rest of this module.
--
-- 2. qa_test_cases — turns the one-off browser-testing prompt into a persistent
--    checklist: a list of test scenarios with a status (not_run/passed/failed/
--    blocked) the founder updates by hand after running them (manually or via the
--    Claude-in-Chrome extension / Playwright) — not an automated results pipeline,
--    that's an explicit later step if this proves useful. Seeded below with the
--    exact checklist from that first testing pass so nothing has to be re-typed.
--
-- Both tables are internal tooling, not part of the real tenancy model — no schema
-- change to organizations/stores/franchise_* themselves, and neither table is
-- referenced by any RLS policy on those tables.

create table demo_scenarios (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  headline            text not null,
  problem_statement   text,
  solution_narrative  text,
  -- Ordered list of {label, detail} — "click X" / "this proves Y" steps for a live
  -- walkthrough. Free-form jsonb rather than a child table: this is presentation
  -- content the founder edits directly, not queried/joined anywhere else.
  walkthrough_steps   jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  last_modified_at    timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table demo_scenarios is
  'Investor-presentable narrative content attached to a demo organization — '
  'authored and managed from the Demo Data admin module. Not customer data, not '
  'read by any org member; platform_admin only.';

create index demo_scenarios_organization_id_idx on demo_scenarios (organization_id) where deleted_at is null;

create table qa_test_cases (
  id                uuid primary key default gen_random_uuid(),
  section           text not null,
  title             text not null,
  description       text,
  status            text not null default 'not_run'
                       check (status in ('not_run', 'passed', 'failed', 'blocked')),
  notes             text,
  last_run_at       timestamptz,
  last_run_by       uuid references members(id),
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table qa_test_cases is
  'A persistent, manually-updated QA checklist — the founder (solo, no team) marks '
  'each case Passed/Failed/Blocked after running it, by hand or via a browser-agent '
  'testing pass, before pushing to production. Not wired to any automated test '
  'runner yet — that is a deliberate later step, not an oversight.';

create index qa_test_cases_status_idx on qa_test_cases (status) where deleted_at is null;

alter table demo_scenarios enable row level security;
alter table qa_test_cases enable row level security;

create policy "platform admins have full access to demo_scenarios"
  on demo_scenarios for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "platform admins have full access to qa_test_cases"
  on qa_test_cases for all
  using (is_platform_admin())
  with check (is_platform_admin());

-- Seed the exact checklist from the first browser-agent testing pass (2026-08-29),
-- so the tracker starts populated instead of empty. Safe to re-run — guarded by a
-- (section, title) existence check since there's no unique constraint on those.
insert into qa_test_cases (section, title, description)
select v.section, v.title, v.description
from (values
  ('Organization flow',
   'Create org, invite two members, confirm pending state',
   'From /admin/orgs, create a throwaway org with one invited org_manager. Confirm it appears with a pending-invite count, then use Invite Member on the edit page to add an org_accountant. Both should show Pending in the Members table.'),
  ('Store flow',
   'Create a store; confirm no edit/delete action exists',
   'From an org''s Stores page, create a test store. Confirm it appears in the list, and confirm there is no edit or delete action anywhere on its card.'),
  ('Store flow',
   'Confirm no store-level staff invite exists for a real org',
   'Search the org portal and store pages for any way to invite store_sales_staff/store_temp_staff/store_cleaning_staff to a real (non-demo) store. Expected: none exists outside the Demo Data module.'),
  ('Franchise flow',
   'Confirm no franchise/settlement UI exists for a real org',
   'On a real org''s edit/store pages, look for any way to join a franchise group or set settlement terms. Expected: none outside the Demo Data module.'),
  ('Demo Data module',
   'Create a demo franchise org end-to-end',
   'From /admin/demo, create a demo org with 2+ stores, default settlement terms, and one org-level invite. Confirm success screen and that it appears in Existing Demo Organizations with a correct settlement summary.'),
  ('Demo Data module',
   'Invite store staff on a demo org''s store',
   'On an existing demo org''s store card, use + Invite Staff to send a store-scoped invite. Confirm it appears listed as pending under that store.'),
  ('Roles/Permissions guardrail',
   'Confirm no warning when editing a system role',
   'Open the edit modal for an existing system role (e.g. org_accountant) in /admin/metadata. Confirm whether any warning appears before a rename/delete would apply. Do not actually save a change.'),
  ('Route gating',
   'Confirm /app has no access gate',
   'While signed in, navigate directly to /app. Confirm it loads without a permission check, and note what each of the five tabs shows.')
) as v(section, title, description)
where not exists (
  select 1 from qa_test_cases existing
  where existing.section = v.section and existing.title = v.title
);
