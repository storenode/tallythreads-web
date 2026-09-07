# Foundation sprint — test data plan

Five real Gmail accounts, reused across every prompt file in this sprint so
the whole matrix (registration types × single/multi-org × single/multi-store
× org-level and store-level roles) gets covered without needing more test
accounts. All organizations below are created with `is_demo = true` so they
never get confused with real customer data (Bandrip, Nellore, Tirupati) and
can be hard-deleted and recreated freely during retests.

## Accounts and what each one tests

| Gmail | Role(s) | Org(s) | Store(s) | What this account stresses |
|---|---|---|---|---|
| `tallythreads.hq@gmail.com` | **Platform admin** (already seeded per `constitution.md` §8 — do not invite this one, it already exists) | — | — | Admin console: creating/editing/deleting every org and role below; the Admin area of the login-routing flow |
| `deepthi.juni@gmail.com` | `org_owner` | **Sundari Silks** (`registration_type = independent`) | Sundari Silks – Kukatpally (1 store) | The simplest possible case: one org, one store, one role — auto-redirect straight to `/ops/:storeId/billing` with no picker screens at all |
| `veerareddy.obula@gmail.com` | `org_owner` | **Vamsi Textiles Group** (`registration_type = chain`) | Vamsi Textiles – Ameerpet, Vamsi Textiles – Dilsukhnagar (2 stores) | One org, multiple stores — the StorePicker screen, and the store→org "in {org}" label on the launch grid |
| `obulareddyveera@gmail.com` | `org_manager` @ Sundari Silks **and** `org_accountant` @ Vamsi Textiles Group | Sundari Silks, Vamsi Textiles Group | (org-level roles only, no direct store membership) | Multi-org membership with a *different* role in each org — this is exactly the class of bug (OrgSwitcher/AreaSwitcher/LaunchPage race conditions) found and fixed earlier this sprint; re-testing this account is the highest-value check in the whole sprint |
| `vbreddy.obulareddy@gmail.com` | `org_owner` @ Kanchi Threads Franchise, **and** `store_manager` (direct store-level invite, no org-level role there) @ Vamsi Textiles – Ameerpet | Kanchi Threads Franchise (`registration_type = franchise`), plus store-only access into Vamsi Textiles Group | Kanchi Threads Franchise – Kompally (1 store) | The `franchise` registration type; a member who owns one org outright but is *only* store staff in a completely different org (StorePickerPage's "spans every org the member has store access in" case); the direct store-level invite path (`invite_store_member`, not the org-level one) |

## Org → store quick reference

- **Sundari Silks** (independent) — Sundari Silks – Kukatpally
- **Vamsi Textiles Group** (chain) — Vamsi Textiles – Ameerpet, Vamsi Textiles – Dilsukhnagar
- **Kanchi Threads Franchise** (franchise) — Kanchi Threads – Kompally

## Notes for whoever runs these prompts

- `tallythreads.hq@gmail.com` is the account that *creates* all three organizations
  and sends all the invites (platform admin does the provisioning per
  `constitution.md` §6 — there's no self-service signup). The other four
  accounts only ever sign in with Google and, on first sign-in, activate the
  placeholder membership that was already granted to their email.
- If you're re-running this sprint from scratch (e.g. after a
  hard-delete-and-recreate cycle), start with
  `01-org-creation-independent.prompt.md` and work through the numbered
  files in order — later prompts assume the orgs/stores from earlier ones
  already exist.
- `registration_type = franchise` on Kanchi Threads Franchise is a **label
  only** in the current foundation — it does not create a real
  `franchise_groups`/`franchise_memberships` link. Don't expect any
  franchise-specific screen or behavior beyond the badge showing "Franchise"
  — that's out of scope for this sprint (see `constitution.md` §5's M1c note).

## Known data-cleanliness issue: deepthi.juni@gmail.com is not single-org

Found while running `01`: the org's Members list showed
`deepthi.juni@gmail.com` as "Active" immediately, before they'd ever signed
in for Sundari Silks. Investigated and confirmed **not a bug** — the
founder confirmed this Gmail account already had a real Google sign-in from
an **earlier, different organization** before this sprint's `01` ever ran,
and `provision_organization_with_contacts()` correctly reuses an
already-active member by email rather than minting a duplicate placeholder
(see `constitution.md` §6). No failure report is kept for this — it never
was a defect, just a stale assumption in this test plan.

That said, it's a real, still-open issue for *this test plan*: it breaks
the "simplest possible case: one org, one store" assumption this account
was assigned above and that `06-login-routing-single-org.prompt.md` is
built around.

**Before running `06`, do one of the following:**

1. **Preferred — clean it up:** sign in as `tallythreads.hq@gmail.com`, find
   whatever other organization `deepthi.juni@gmail.com` belongs to, and
   remove that membership (revoke it, or hard-delete that org entirely if
   it's disposable leftover test/demo data — check first that it isn't
   something worth keeping). This restores `deepthi.juni@gmail.com` to
   truly single-org and keeps `06`'s prompt file usable as written.
2. **Or — adjust the test:** if that other org needs to stay, update
   `06-login-routing-single-org.prompt.md`'s pass criteria to expect a
   picker screen for `deepthi.juni@gmail.com` too (making it a second
   multi-org account rather than the single-org control case) — but then
   nothing in this sprint tests the true "one org, one store, zero pickers"
   path, which is worth having, so option 1 is the better fix if at all
   possible.
