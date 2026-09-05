# TallyThreads — Manual QA via Claude in Chrome

This folder holds hand-run QA "prompt files" for testing the live app at
**https://tallythreads.vercel.app** using the Claude in Chrome browser extension —
not an automated test suite (no Playwright/Vitest here; those are a separate,
later concern). Each prompt file is a self-contained set of instructions you
paste directly into the Claude in Chrome extension. It drives the browser,
checks the app behaves as expected, and reports back — either "all checks
passed" or one or more structured failure reports you can save and re-test
later.

## Folder structure

```
_e2e_/
  README.md                        <- this file
  foundation/                      <- the "foundation" sprint (org/store/member/RBAC-routing)
    00-test-data-plan.md           <- who's who: the 5 test accounts, orgs, stores, roles
    _failure-case-template.md      <- the canonical failure-report format
    STATUS.md                      <- checklist tracker for this sprint's 10 test areas
    01-...10-*.prompt.md           <- one prompt file per test area
    failures/                      <- saved failure reports land here (created as needed)
  <future-sprint>/                 <- e.g. _e2e_/billing/ once M5 is being QA'd
```

A new sprint (billing, inventory, franchise settlement, …) gets its own
sibling folder under `_e2e_/`, following the same pattern: a
`00-test-data-plan.md`, prompt files numbered by test area, a `STATUS.md`,
and its own `failures/` folder.

## How to run a prompt file

1. Open **https://tallythreads.vercel.app** in Chrome.
2. Open the Claude in Chrome extension panel.
3. Open the prompt file you want to run (e.g.
   `foundation/01-org-creation-independent.prompt.md`), copy its entire
   contents, and paste it as your message to Claude in Chrome.
4. Let it drive the browser and report back. It ends its reply with either:
   - **PASS** — every check in the file's "Pass criteria" section held, or
   - one or more **FAILURE REPORT** blocks, one per broken check.
5. For each FAILURE REPORT block: save it as a new file under
   `foundation/failures/<slug>.md` (the report itself suggests a slug). If a
   report with that slug already exists (a repeat failure), append a new
   entry under that file's "Retest history" instead of creating a duplicate.
6. Update `foundation/STATUS.md`: mark that test area PASS or FAIL (with the
   failure slug) and the date you ran it.
7. After a bug is fixed, **re-run the exact same prompt file, unchanged.**
   That's the retest. If it now reports PASS, update the failure report's
   "Retest history" with a RESOLVED entry (don't delete the file — it's the
   record that this was once broken and confirmed fixed) and flip
   `STATUS.md` to PASS.
8. **If investigation shows it was never actually a defect** — a stale test
   account, a misread of intended behavior, bad test data rather than a
   real bug — delete the failure report entirely instead of marking it
   RESOLVED, and clear its slug from `STATUS.md`. Keeping a "failure" file
   for something that was never actually broken misrepresents the app's
   real history; that record only belongs to confirmed, then-fixed bugs. If
   the false positive points at a real problem with the *test plan itself*
   (e.g. a test account turned out not to be in the state the plan assumed),
   note that separately in `00-test-data-plan.md` instead — see its
   "deepthi.juni@gmail.com is not single-org" note for an example of exactly
   this happening.

## Why prompt files instead of a real test suite

The org/store/member/RBAC-routing foundation has no automated test coverage
yet (see `claude/constitution.md` §8's 2026-09-02 entry) — these prompt files
are the fast way to get real coverage today, run by a human clicking through
the actual product against the actual live database, the same way a real
customer would hit it. They're deliberately kept as plain-language
instructions (not scripts) so anyone — not just a developer — can run one by
pasting it into Claude in Chrome. Converting the stable ones into a real
Playwright/Vitest suite is a reasonable later step once the foundation is
confirmed solid, not a replacement for this loop right now.

## Test data note

Every organization these prompts create is marked as a **demo organization**
(`is_demo = true`) specifically so it's easy to tell apart from real customer
data (Bandrip, Nellore, Tirupati) and safe to hard-delete/recreate freely.
See `foundation/00-test-data-plan.md` for exactly which orgs, stores, and
Gmail accounts are used and why.
