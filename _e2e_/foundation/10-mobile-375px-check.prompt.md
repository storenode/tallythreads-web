# Prompt: 375px mobile viewport pass

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. This checks `constitution.md` §7's Definition-of-Done
requirement: "manually tested at 375px viewport width" — billing counters
run on small Android tablets/phones, so nothing in this foundation should
break, overflow, or become unusable at that width.

**Prerequisite:** at least one of `01`–`08` already run, so there's real
data to look at (orgs, stores, members) rather than empty screens.

## Steps

1. Resize the browser window (or use DevTools' device toolbar) to exactly
   **375px wide**.
2. Sign in as `storenode.hq@gmail.com` and step through, at 375px width:
   - `/admin/organizations` — the org list/cards and the "New organization"
     form.
   - An organization's detail/member view, and the invite-member form.
   - The org create-and-delete modals (soft-delete "Disable" vs "Delete
     permanently" choice, and the typed-name hard-delete confirmation).
3. Sign in as `veerareddy.obula@gmail.com` and, at 375px width, step
   through:
   - The launch/picker screen listing Vamsi Textiles Group's two stores.
   - A store's edit page, including the "Danger zone" archive/delete card
     and its confirmation modals.
   - The header's org/store switcher.
4. Sign in as `obulareddyveera@gmail.com` and, at 375px width, check the
   multi-org launch grid and the header switcher when moving between
   Sundari Silks and Vamsi Textiles Group.

For each screen, look specifically for: text or buttons cut off/overlapping,
horizontal scrolling that shouldn't be there, modals that overflow the
viewport or can't be dismissed, form fields too narrow to use, and the
typed-name confirmation input being usable (not obscured by the keyboard on
a real device — approximate this by checking the input stays visible and
reachable).

## Pass criteria

- [ ] Every screen listed above renders without horizontal scroll or visibly
      cut-off content at 375px.
- [ ] Every modal (org delete choice, hard-delete confirmation, store
      archive/delete) is fully usable at 375px — visible, scrollable if
      needed, dismissible.
- [ ] All forms (org create, member invite, store edit) remain fillable —
      no field so narrow its content is unreadable.
- [ ] The header switcher (area/org/store) remains usable at 375px, not just
      present.
- [ ] No console errors caused specifically by the narrow viewport.

## On failure

Output one block per failed checkbox, naming the specific screen:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 10-mobile-375px-check
screen: <which screen/modal broke>
account: <whichever account was active when it broke>
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
10-mobile-375px-check`.
