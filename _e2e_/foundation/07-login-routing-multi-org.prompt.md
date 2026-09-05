# Prompt: Login routing — multi-org / multi-role accounts (highest priority)

You are QA-testing the live TallyThreads app at **https://tallythreads.vercel.app**
using this browser. Follow the steps exactly; don't assume something worked
without seeing it confirmed on screen. **This is the single most important
prompt file in the foundation sprint** — the account below is deliberately
built to re-trigger the exact race-condition bug class (LaunchPage /
AreaSwitcher / StoreSwitcher / OrgSwitcher / StorePickerPage all reading
`entitlementsLoading` as settled before `member` had actually resolved) that
was found and fixed earlier this sprint. If this prompt passes cleanly,
that's strong evidence the fix holds; if it fails, it's very likely the same
bug class again — say so explicitly in the failure report.

**Prerequisite:** `01`–`05` already run (all orgs, stores, and memberships
exist, including `obulareddyveera@gmail.com`'s two org-level memberships and
`vbreddy.obulareddy@gmail.com`'s combined org-owner + store-only access).

## Steps — obulareddyveera@gmail.com (Manager @ Sundari Silks, Accountant @ Vamsi Textiles Group)

1. Sign in fresh as `obulareddyveera@gmail.com`.
2. Observe the very first screen after sign-in/PIN. It should show a launch
   grid/picker listing **both** organizations (Sundari Silks and Vamsi
   Textiles Group) — this account has no single-org auto-redirect available
   since it holds roles in two different orgs.
3. Select Sundari Silks. Confirm the header reads "Organization" (or
   equivalent) for Sundari Silks, showing role "Manager".
4. Use the header switcher to move to Vamsi Textiles Group. Confirm the
   header updates to Vamsi Textiles Group with role "Accountant" — not a
   stale "Manager" label carried over from Sundari Silks, and not a
   `/no-store` or blank-screen redirect.
5. Reload the page while on Vamsi Textiles Group. Confirm it reloads to the
   same org, not back to Sundari Silks or a picker screen.
6. Switch back to Sundari Silks via the header. Confirm it's clean both
   directions (not just Sundari→Vamsi).

## Steps — vbreddy.obulareddy@gmail.com (Owner @ Kanchi Threads Franchise, store-only staff @ Vamsi Textiles – Ameerpet)

7. Sign out, sign in fresh as `vbreddy.obulareddy@gmail.com`.
8. This account has org-level access to ONE org (Kanchi Threads Franchise,
   as Owner) plus store-only access to a store that belongs to a
   *different* org (Vamsi Textiles – Ameerpet). Confirm the initial
   screen/picker reflects BOTH — i.e. the store picker (if that's where it
   lands first) should show Ameerpet even though this account has no
   org-level role in Vamsi Textiles Group at all.
9. Navigate into Kanchi Threads Franchise's org console. Confirm it loads
   correctly with role "Owner".
10. Navigate into Vamsi Textiles – Ameerpet's operations view (billing).
    Confirm it loads correctly, header reads "Operations", and nothing
    tries to route this account into Vamsi Textiles Group's *org* console
    (it has no access there — only to that one store).

## Pass criteria

- [ ] `obulareddyveera@gmail.com` sees both orgs listed on first landing,
      with no premature redirect to `/no-store` before entitlements finish
      loading.
- [ ] Switching between Sundari Silks and Vamsi Textiles Group via the
      header updates the role label correctly both directions.
- [ ] A page reload while inside an org keeps you in that same org (no
      snap-back to a picker or the wrong org).
- [ ] `vbreddy.obulareddy@gmail.com` correctly sees both Kanchi Threads
      Franchise (org-level, Owner) and Vamsi Textiles – Ameerpet
      (store-only) as accessible destinations.
- [ ] Neither account is ever silently dropped onto `/no-store` at any point
      in this flow.
- [ ] No console errors during any step.

## On failure

Output one block per failed checkbox. If the failure looks like the
`entitlementsLoading`-alone race condition (a real destination briefly
flashes `/no-store` or the wrong org/role before correcting itself, or
doesn't correct itself at all), say so explicitly in the report:

```
FAILURE REPORT
slug: <short-kebab-case-id>
area: 07-login-routing-multi-org
account: <whichever account was active when it broke>
severity: <blocker|major|minor>
looks_like_entitlements_race: <yes|no|unsure>
steps_to_reproduce:
  1. ...
expected: ...
actual: ...
```

If every checkbox passed, reply with: `PASS — all checks passed for
07-login-routing-multi-org`.
