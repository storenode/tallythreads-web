# Prompt: Org creation — chain registration type, multi-store

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Sign-in:** Use **storenode.hq@gmail.com** (platform admin). If this
browser isn't already signed into that account, stop and ask the user to
switch/sign in manually first.

## Steps

1. Sign in as `storenode.hq@gmail.com`, go to `/admin/organizations`.
2. Create a new organization:
   - Name: **Vamsi Textiles Group**
   - Registration type: **Chain**
   - Demo organization: checked
   - Add one invite: email `veerareddy.obula@gmail.com`, role **Owner**,
     marked as primary contact.
3. Save/create the organization.
4. Create **two** stores under it:
   - **Vamsi Textiles – Ameerpet**
   - **Vamsi Textiles – Dilsukhnagar**
5. Confirm both stores are listed under Vamsi Textiles Group and neither is
   accidentally attached to Sundari Silks or any other org.
6. Confirm `veerareddy.obula@gmail.com` shows as "Owner" / "Invited" on the
   org's member list.

## Pass criteria

- [ ] The org was created, registration type badge reads "Chain".
- [ ] Both stores exist and are listed only under Vamsi Textiles Group.
- [ ] `veerareddy.obula@gmail.com` appears as Owner, status Invited.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 02-org-creation-chain-multistore
account: storenode.hq@gmail.com
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
02-org-creation-chain-multistore`.
