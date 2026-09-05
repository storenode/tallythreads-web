# Prompt: Org creation — franchise registration type

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Sign-in:** Use **storenode.hq@gmail.com** (platform admin). If this
browser isn't already signed into that account, stop and ask the user to
switch/sign in manually first.

## Steps

1. Sign in as `storenode.hq@gmail.com`, go to `/admin/organizations`.
2. Create a new organization:
   - Name: **Kanchi Threads Franchise**
   - Registration type: **Franchise**
   - Demo organization: checked
   - Add one invite: email `vbreddy.obulareddy@gmail.com`, role **Owner**,
     marked as primary contact.
3. Save/create the organization.
4. Create one store under it: **Kanchi Threads – Kompally**.
5. Confirm the org's registration type badge reads "Franchise", and note
   whether the UI shows anything implying an actual franchor/franchisee
   *relationship* now exists (it should not — this field is a label only in
   the current build; see `foundation/00-test-data-plan.md`).

## Pass criteria

- [ ] The org was created, registration type badge reads "Franchise".
- [ ] The store "Kanchi Threads – Kompally" is listed under it.
- [ ] `vbreddy.obulareddy@gmail.com` appears as Owner, status Invited.
- [ ] Nothing on screen implies a real franchise-group linkage was created
      (no franchisor selection, no settlement-rule screen, etc.) — if
      something like that *does* appear, that's worth flagging even though
      it's a pleasant surprise, since it would mean scope has moved beyond
      what `constitution.md` currently documents.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 03-org-creation-franchise
account: storenode.hq@gmail.com
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
03-org-creation-franchise`.
