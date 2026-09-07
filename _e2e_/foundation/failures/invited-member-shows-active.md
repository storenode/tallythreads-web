FAILURE REPORT
slug: invited-member-shows-active
area: 01-org-creation-independent
account: tallythreads.hq@gmail.com
severity: major (as filed) — downgraded to N/A on resolution
status: CLOSED — not a bug, confirmed intended behavior

steps_to_reproduce:

1. As tallythreads.hq@gmail.com, go to /admin/organizations, click "New organization"
2. Fill in Name "Sundari Silks", Registration type "Independent", check "Demo organization"
3. Add invite: email deepthi.juni@gmail.com, role Owner, Primary contact checked
4. Click "Create organization"
5. Open the org's edit/detail page, scroll to "Members" section
   expected: deepthi.juni@gmail.com should appear with status "Invited" since they have not yet signed in
   actual: deepthi.juni@gmail.com appears with status "Active" immediately after org creation, with a green "Primary contact" indicator and a "Revoke" action — indistinguishable from a member who has actually accepted and signed in. No console errors accompanied this.

## Investigation notes (2026-09-03)

Audited both sides of this path in the repo — `provision_organization_with_contacts()`
(explicitly inserts `is_active = false` for a genuinely new placeholder) and
`MembersCard`'s render logic (`m.isActive ? "Active" : "Invited"`, straight
off `fetchOrganizationMembers()`, no caching issue) — both correct as
written. Two candidate explanations were logged: (1) `deepthi.juni@gmail.com`
already had a real Google sign-in from a different, earlier organization, in
which case the app's documented member-reuse-by-email behavior is working
exactly as designed; (2) the live Supabase function is out of sync with this
migration.

**Founder confirmed (2026-09-03): `deepthi.juni@gmail.com` had already
signed in as a member of another organization before this test ran.**
That resolves it as explanation (1) — this is `provision_organization_with_contacts()`
correctly reusing an already-active member by email rather than minting a
duplicate placeholder, per `constitution.md` §6 ("access is granted at
invite time... signing in with Google never grants NEW access by itself").
**Not a bug. No code change made.**

### Real consequence for the test plan, not the app

`deepthi.juni@gmail.com` was assigned in `00-test-data-plan.md` as the
"simplest possible case: one org, one store, one role" persona for
`06-login-routing-single-org.prompt.md`. That assumption no longer holds —
this account now belongs to at least one other organization too, so it will
no longer auto-redirect straight to a single store. This needs a decision
before continuing the sprint (see the accompanying chat message): either
clean up that other organization/membership so `deepthi.juni@gmail.com` is
single-org again, or accept it's now a second multi-org account and adjust
`06`'s pass criteria accordingly.

## Retest history

| Date | Result | Notes |
|---|---|---|
| 2026-09-03 | FAIL | initial finding |
| 2026-09-03 | INVESTIGATING | code audit found no bug in either the RPC or the UI as written — needed founder input |
| 2026-09-03 | RESOLVED | founder confirmed deepthi.juni@gmail.com had prior access elsewhere — working as designed, not a defect. Follow-up needed on test-data cleanliness, tracked separately, not in this file. |
