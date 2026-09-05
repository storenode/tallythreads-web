# Prompt: Store archive, restore, and hard-delete

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Prerequisite:** `02` already run (Vamsi Textiles Group with its two
stores exists). **Run this before `09`** — `09` hard-deletes the
organizations this prompt's stores belong to.

**Sign-in:** Use `veerareddy.obula@gmail.com` (the org owner — store
delete/archive/restore is `org_owner`-or-platform-admin only, not
`org_manager`; see `StoreEditPage.tsx`'s `canDelete` gate). Confirm the
permission gate itself while you're at it: an `org_manager`-only account
should NOT see the Archive/Delete controls at all (there isn't one to hand
in this sprint's account set, so just note in your report that this
sub-check was skipped for lack of an `org_manager`-only test account, don't
mark it fail).

## Steps

1. Sign in as `veerareddy.obula@gmail.com`. Open **Vamsi Textiles –
   Dilsukhnagar**'s store edit page.
2. In the "Danger zone" card, click "Archive". Confirm the modal, archive
   the store.
3. Confirm the store is now hidden from the normal store list, but appears
   under "Show archived stores".
4. Reopen the archived store's edit page. Confirm the "This store is
   archived" banner shows, with a "Restore" button.
5. Click "Restore". Confirm the store reappears in the normal (non-archived)
   list, and its data (name, address, etc. from `02`) is intact — not reset.
6. Archive it again. This time, instead of restoring, click "Delete
   permanently", type the store name to confirm, and confirm the deletion
   succeeds with a sensible cascade-delete summary (memberships, etc.).
7. Confirm Vamsi Textiles Group itself still exists and still correctly
   shows only **Vamsi Textiles – Ameerpet** now (Dilsukhnagar gone, Ameerpet
   untouched — including `vbreddy.obulareddy@gmail.com`'s store-level
   membership from `05`, which should be unaffected).

## Pass criteria

- [ ] Archive hides the store from the normal list and shows it under
      "archived".
- [ ] Restore brings it back with its data intact, no data loss.
- [ ] Hard-delete (after typed-name confirmation) succeeds with a sensible
      summary.
- [ ] The parent org and the sibling store (Ameerpet) are unaffected by
      Dilsukhnagar's archive/restore/delete cycle.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 08-store-archive-restore-harddelete
account: veerareddy.obula@gmail.com
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
08-store-archive-restore-harddelete`.
