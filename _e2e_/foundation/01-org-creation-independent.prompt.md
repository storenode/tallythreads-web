# Prompt: Org creation — independent registration type

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. This is a real Supabase-backed app being deliberately
stabilized — follow the steps exactly, don't skip anything, and don't assume
something worked without seeing it confirmed on screen (a toast, a URL
change, the new row actually listed).

**Sign-in:** Use the Google account **tallythreads.hq@gmail.com** (platform
admin). If this browser isn't already signed into that account, stop and ask
the user to switch/sign in manually first — don't attempt to guess a
password or click through a real Google account picker blind.

## Steps

1. Sign in as `tallythreads.hq@gmail.com` and navigate to the Admin
   Organizations screen (`/admin/organizations`).
2. Click "New organization". Fill in:
   - Name: **Sundari Silks**
   - Registration type: **Independent**
   - Demo organization: checked (`is_demo = true`)
   - Add one invite: email `deepthi.juni@gmail.com`, role **Owner**, marked
     as primary contact.
3. Save/create the organization.
4. Create one store under Sundari Silks: name **Sundari Silks – Kukatpally**.
5. Open the organization's detail/members view and confirm the invited
   member shows up with status **Invited** (not yet Active — that's correct,
   since `deepthi.juni@gmail.com` hasn't signed in yet).

## Pass criteria

- [ ] The org was created without error and appears in the Organizations list.
- [ ] Its registration type badge reads "Independent".
- [ ] Its "Demo" badge is visible.
- [ ] The store "Sundari Silks – Kukatpally" was created and is listed under
      this org.
- [ ] `deepthi.juni@gmail.com` appears in the org's member list with role
      "Owner" and status "Invited".
- [ ] No console errors appeared during any of the above (check the browser
      console).

## On failure

For each unmet checkbox, output a block like this (one per failure — don't
bundle several into one):

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 01-org-creation-independent
account: tallythreads.hq@gmail.com
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: <what the checklist said should happen>
actual: <what actually happened, incl. any console error text>
```

If every checkbox passed, reply with a single line: `PASS — all checks
passed for 01-org-creation-independent`.
