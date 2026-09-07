# Prompt: Org-level invite (post-creation) + placeholder activation

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Prerequisite:** `01`, `02`, and `03` must already have been run (Sundari
Silks, Vamsi Textiles Group, and Kanchi Threads Franchise all exist, each
with one invited-but-not-yet-active Owner).

This prompt has two parts: **A)** inviting a member to an *already-existing*
org (not at creation time), and **B)** confirming the placeholder→real
activation mechanism works when someone actually signs in.

## Part A — post-creation invites (as tallythreads.hq@gmail.com)

1. Sign in as `tallythreads.hq@gmail.com`. Open **Sundari Silks**'s member
   list and invite: email `obulareddyveera@gmail.com`, role **Manager**.
2. Open **Vamsi Textiles Group**'s member list and invite: email
   `obulareddyveera@gmail.com`, role **Accountant**.
3. Confirm both invites now show `obulareddyveera@gmail.com` with status
   "Invited" under their respective orgs — this is the *same* Google account
   invited into two different organizations with two different roles.

## Part B — activation (sign out, then sign in as each invited owner)

4. Sign out. Sign in fresh as `deepthi.juni@gmail.com`. Complete PIN setup
   if prompted. Go back to `tallythreads.hq@gmail.com`'s admin view of Sundari
   Silks's member list (you may need to sign back in as the admin) and
   confirm `deepthi.juni@gmail.com` now shows status **Active**, not
   Invited — and that this did NOT create a second, duplicate member row.
5. Repeat for `veerareddy.obula@gmail.com` (should activate on Vamsi
   Textiles Group) and `vbreddy.obulareddy@gmail.com` (should activate on
   Kanchi Threads Franchise).

## Pass criteria

- [ ] `obulareddyveera@gmail.com` is invited into both Sundari Silks (as
      Manager) and Vamsi Textiles Group (as Accountant) without error.
- [ ] Each of the three owners (`deepthi.juni`, `veerareddy.obula`,
      `vbreddy.obulareddy`) can sign in with Google and land somewhere
      sensible (don't worry about *which* screen yet — that's covered in
      `06`/`07` — just confirm sign-in itself succeeds, no error, no stuck
      loading state).
- [ ] After each sign-in, that member's status in the admin member list
      flips from "Invited" to "Active".
- [ ] No duplicate member rows were created for anyone (check email appears
      only once per org's member list).
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 04-org-level-member-invite-and-activation
account: <whichever account was active when it broke>
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
04-org-level-member-invite-and-activation`.
