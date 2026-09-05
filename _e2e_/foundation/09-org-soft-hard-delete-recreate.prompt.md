# Prompt: Organization disable (soft-delete), hard-delete, and recreate

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Run this one LAST**, after `01`–`08` all pass — it deletes the demo orgs
those prompts depend on. Re-running `01`–`07` after this means recreating
those orgs from scratch, which is the point of this check.

**Sign-in:** Use **storenode.hq@gmail.com** (platform admin). Only a
platform admin can hard-delete an organization.

**Known limitation, not a bug:** there is currently no "restore" for a
disabled organization (stores have restore, organizations don't — this is a
tracked, deliberately deprioritized gap, see `constitution.md` §8's
2026-09-02 entry). Don't report the absence of an org-restore button as a
failure — only report it if the app crashes or behaves inconsistently, not
for simply not having the feature.

## Steps

1. Sign in as `storenode.hq@gmail.com`, go to `/admin/organizations`.
2. Pick **Sundari Silks** (from `01`). Click "Delete" → "Disable". Confirm
   it disappears from the default organizations list.
3. Toggle "Show demo organizations" / any relevant filter if needed and
   confirm there's no UI path to bring it back (expected — see the note
   above) other than hard-delete.
4. Click "Delete" → "Delete permanently" on the same (now-disabled) Sundari
   Silks. Type the org name to confirm. Confirm the deletion succeeds and
   the summary shown (stores/memberships/etc. deleted counts) looks
   sensible (1 store, at least 2 memberships — Owner + Manager from `01`
   and `04`).
5. Immediately create a **new** organization also named **Sundari Silks**,
   independent type, with a new store also named **Sundari Silks –
   Kukatpally**. Confirm this succeeds without any leftover-data conflict
   (e.g. a "name already exists" error, or the new org somehow inheriting
   old members).
6. Re-invite `deepthi.juni@gmail.com` as Owner on this fresh org. Confirm it
   invites cleanly as a **new** placeholder-or-reused-member — sign in as
   `deepthi.juni@gmail.com` and confirm they land in the NEW org (with a
   fresh, empty store), not any stale state from the deleted one.
7. Repeat steps 2–4 (disable, then hard-delete) on **Vamsi Textiles Group**
   and **Kanchi Threads Franchise** to fully clean up this sprint's demo
   data. Skip step 5–6 recreation for these two unless you want to re-verify
   recreation on a multi-store/franchise org too.

## Pass criteria

- [ ] Disabling Sundari Silks hides it from the default list without error.
- [ ] Hard-deleting it succeeds, with a sensible cascade-delete summary.
- [ ] Recreating an org with the exact same name immediately after succeeds
      with no conflict and no leftover data from the deleted org.
- [ ] Re-inviting `deepthi.juni@gmail.com` on the new org works cleanly, and
      signing in lands them in the new org's (empty) store — not the old one.
- [ ] Vamsi Textiles Group and Kanchi Threads Franchise can also be
      disabled then hard-deleted without error.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 09-org-soft-hard-delete-recreate
account: storenode.hq@gmail.com
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
09-org-soft-hard-delete-recreate`.
