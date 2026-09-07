# Prompt: Store-level direct invite (no org-level role)

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Prerequisite:** `02` must already have been run (Vamsi Textiles Group and
its two stores exist).

This tests the *other* invite path — `invite_store_member`, inviting someone
directly onto one store, with no organization-level role at all.

## Steps

1. Sign in as `tallythreads.hq@gmail.com` (or as `veerareddy.obula@gmail.com`,
   the org owner — either should be able to do this; try the org owner
   first since that's the realistic case a real customer would hit).
2. Open **Vamsi Textiles – Ameerpet**'s store detail page, find its Members
   card, and invite: email `vbreddy.obulareddy@gmail.com`, role
   **Store manager**.
3. Confirm this member now appears in Ameerpet's store member list — and
   confirm they do **not** appear anywhere in Vamsi Textiles Group's
   *organization*-level member list (this membership is store-scoped only).
4. Sign out, sign in as `vbreddy.obulareddy@gmail.com` (this account should
   already exist and be active from `04`, since it's also the owner of
   Kanchi Threads Franchise). Confirm sign-in succeeds without error.

## Pass criteria

- [ ] The invite succeeds without error, from an org-owner account (not just
      platform admin) — this is the permission this feature is meant for.
- [ ] `vbreddy.obulareddy@gmail.com` appears in Ameerpet's store-level
      member list with role "Store manager".
- [ ] `vbreddy.obulareddy@gmail.com` does **not** appear in Vamsi Textiles
      Group's org-level member list (only the store one).
- [ ] Signing in as `vbreddy.obulareddy@gmail.com` still works cleanly even
      though this account now holds two very different kinds of access
      (org-owner elsewhere, store-only here).
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 05-store-level-member-invite-direct
account: <whichever account was active when it broke>
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
05-store-level-member-invite-direct`.
