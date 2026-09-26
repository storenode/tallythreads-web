# E2E — Playwright happy-path suite

Automated end-to-end tests for the core happy paths, run in a real Chromium against the
**live Supabase project**. Every test works only on `is_demo = true` organizations that it
creates itself and **hard-deletes afterwards** (`hard_delete_organization`, which also purges
orphaned placeholder members). Real customer orgs (Bandrip, Nellore, Tirupati) are never touched.

This is separate from `_e2e_/`, which holds the hand-run "Claude in Chrome" QA prompt files.

## What it covers

Every flow runs twice: `desktop`, and `mobile-375`, a 375px phone viewport (constitution §7.3).

| Spec | Happy path |
|---|---|
| `auth.spec.ts` | A demo launch link (`demo-login` issue → `/demo/launch` redeem) signs the org owner in and lands in `/org/:orgId`; the admin session opens the admin console |
| `org-setup-wizard.spec.ts` | Admin: Organization (demo, trial) → Stores (+ categories: 2 standard + 1 custom, re-checked and synced) → Stock setup (stock room) → Members (owner + primary contact, "Owner manages this store") → **Go live**; verifies `status = active` in the DB |
| `purchase-trip.spec.ts` | Owner: plan → start → manual invoice + item → expense → **landed ₹1,050.00 / MRP ₹1,260.00** → complete; verifies the sync to Supabase |
| `deliveries.spec.ts` | Owner: Pending → In Transit → Received (list buttons) → item check gates Verify → Verified → **Ready for Inventory**; verifies the DB |
| `offline-sync.spec.ts` | Owner: create a trip **offline** → Dexie row `_dirty = 1`, not on the server → reconnect → synced to Supabase, "Synced ✓" (§2.I, §7.2, §7.4) |

## Setup

Add these to `.env.local` (gitignored, and the same file `pnpm dev` reads):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
E2E_ADMIN_JWT=<platform admin session JWT>
# Optional: test an already-running app instead of starting `pnpm dev`
# E2E_BASE_URL=https://<preview>.vercel.app
```

**Getting `E2E_ADMIN_JWT`:** Google sign-in and the PIN can't be automated, so the suite reuses a
real platform-admin session.

1. Sign in to the app as the platform admin (`tallythreads.hq@gmail.com`).
2. Open DevTools → Application → IndexedDB → `tallythreads` → `members`.
3. Copy the `jwt` of the row where `is_active = 1`.

The JWT is valid for 30 days. Treat it like a password: keep it only in `.env.local` or a CI
secret, never in git.

Org-owner sessions need no setup. Each test mints its own through the admin-only
`demo-login` "issue" action.

## Run

```bash
pnpm e2e                          # all specs, desktop + mobile-375 (starts `pnpm dev`)
pnpm e2e --project=desktop        # one viewport
pnpm e2e purchase-trip            # one spec
pnpm e2e:ui                       # interactive UI mode
pnpm e2e:report                   # open the last HTML report (traces/video on failure)
```

Browsers: `pnpm exec playwright install chromium` on a fresh machine. The Claude Code cloud
container already has Chromium 1194, which is why `@playwright/test` is pinned to `1.56.1`.

## How it works

- **Sign-in:** the app keeps the active member and their JWT in its Dexie DB
  (`src/lib/memberSession.ts`). `support/session.ts` writes that same row, the way
  `cacheActiveMember()` does after a real sign-in. `auth.spec.ts` also covers the real
  in-browser `/demo/launch` path.
- **Seeding and checks:** `support/api.ts` calls Supabase with a real member JWT, so RLS applies.
  It seeds data through the same RPCs the app uses and checks that UI actions reached the server.
- **Offline:** the dev build's service worker is blocked for determinism. `offline-sync.spec.ts`
  loads the routes while online, then works offline with client-side navigation.
- **Serial runs:** `workers: 1` keeps the load on the one shared live project small.

## Adding a spec

Use `import { test, expect } from "./support/fixtures"`, and ask for `adminPage`, `ownerPage`,
`demoOrg`, `ownerSession`, `env` or `tag`. An org created through the UI must be passed to
`deleteOrgAfter(orgId)` so it gets cleaned up. Prefer role and label selectors. Where the UI renders a
mobile and a desktop copy of the same field, target the visible one (`:visible`).
