# Prompt: Login routing — single-org, single-role accounts

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen.

**Prerequisite:** `01`–`04` already run (all three demo orgs exist, all
owners activated).

This checks the simplest routing cases: an account with exactly one org and
one store should skip every picker screen entirely.

## Steps — deepthi.juni@gmail.com (Sundari Silks, 1 store)

1. Sign in as `deepthi.juni@gmail.com`.
2. Observe where you land immediately after sign-in (and PIN, if prompted).
3. Note the URL and the screen content.

## Steps — veerareddy.obula@gmail.com (Vamsi Textiles Group, 2 stores)

4. Sign out, sign in as `veerareddy.obula@gmail.com`.
5. Since this account has ONE org but TWO stores, you should land on some
   form of store picker (or the launch grid showing both stores) rather than
   an auto-redirect straight into billing.
6. Pick either store and confirm you land on `/ops/<storeId>/billing` for
   the store you picked, with the header showing "Operations" (not
   "Organizations" or "Admin").
7. Use the header's area/org/store switcher to navigate back and forth
   between the two Vamsi stores. Confirm the URL and header both update
   correctly each time — no flash of the wrong area name, no accidental
   redirect to `/no-store`.

## Pass criteria

- [ ] `deepthi.juni@gmail.com` lands directly on
      `/ops/<storeId>/billing` for Sundari Silks – Kukatpally, with no
      picker screen shown in between.
- [ ] `veerareddy.obula@gmail.com` is shown a choice between the two Vamsi
      stores (not auto-redirected to one silently).
- [ ] Picking a store lands on that store's `/ops/<storeId>/billing` with
      the header correctly reading "Operations".
- [ ] Switching between the two stores via the header switcher works
      cleanly both directions, with no stale header label and no
      `/no-store` redirect.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 06-login-routing-single-org
account: <whichever account was active when it broke>
severity: <blocker|major|minor>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
06-login-routing-single-org`.
