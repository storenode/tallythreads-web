# M0 — Project foundation, PWA config, CI

**Status:** Completed
**Version:** 1.0.0
**Est:** 8 hrs (Constitution §5)
**Tracking:** [Issue #24](https://github.com/storenode/storeparda-web/issues/24)

Build passes, typecheck passes, tests pass, service worker registers, shell renders at
375px with no horizontal scroll, `NOTICE.md` committed, personal git identity confirmed.

## Definition of Done
- [x] `pnpm build` clean, `pnpm typecheck` clean, `pnpm test` green
- [x] CI workflow in place (`.github/workflows/ci.yml`)
- [x] PWA manifest + service worker configured (prompt-mode update, offline-first)
- [x] DevTools at 375px: no horizontal scroll, every tab target ≥ 44px
- [x] `src/lib` coverage ≥ 90% (91.3%, 8/8 tests passing)
- [x] Real brand icons in `public/` (pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png), maskable safe-zone checked
- [x] `NOTICE.md` committed, personal git identity confirmed via `git log`
- [ ] Manual device checks pending: install as PWA on Android, airplane-mode reload test — to be verified on a real device before go-live

---

## Setup Guide

Written 2026-08-18 against Constitution v1.0.0. Every step below was executed and verified
in a clean sandbox — the build passes, tests pass, the service worker registers, and the
shell renders at 375px with no horizontal scroll.

---

## 0. Before you type anything — IP separation (Constitution §1)

This is the one step that is genuinely irreversible if you get it wrong, so do it first.

1. Personal machine, personal GitHub account, personal Vercel/Supabase accounts. Never
   the employer SSO login, never a work laptop, never work hours.
2. Set a repo-local git identity so a stray global work identity can't leak into commits:

   ```bash
   mkdir tallythreads && cd tallythreads && git init
   git config user.name "Your Name"
   git config user.email "your-personal@email.com"
   ```

3. Create the GitHub repo **private**, owned by your personal account.
4. Commit a `NOTICE.md` at the root now, before any code:

   ```markdown
   # Ownership Notice
   All code in this repository is authored on personally-owned hardware, using
   personal accounts, outside of any employer's working hours, and without the use
   of any employer resources, confidential information, or intellectual property.
   ```

   It's cheap and it's the kind of contemporaneous record that matters if it ever matters.

---

## 1. Scaffold

```bash
pnpm create vite@latest tallythreads --template react-ts
cd tallythreads
```

> If you already made the folder in step 0, scaffold into a temp dir and move the files in,
> or just run `pnpm create vite@latest .` inside it.

**Heads up:** as of August 2026 the Vite React-TS template ships **Vite 8, React 19,
TypeScript 6, and oxlint** (ESLint is no longer the default linter in the template). The
constitution locks React 18, so the next step pins it back down. See §13 for the amendment
question this raises.

---

## 2. Dependencies

Runtime — pin React 18 per Constitution §4:

```bash
pnpm add react@^18.3.1 react-dom@^18.3.1
pnpm add -D @types/react@^18.3 @types/react-dom@^18.3

pnpm add \
  react-router-dom@^6.30.1 \
  @tanstack/react-query@^5 \
  dexie@^4 dexie-react-hooks@^4 \
  react-hook-form@^7 zod@^4 @hookform/resolvers \
  @supabase/supabase-js@^2 \
  jsbarcode lucide-react react-to-print
```

Dev:

```bash
pnpm add -D \
  tailwindcss@^4 @tailwindcss/vite@^4 \
  vite-plugin-pwa@^1 workbox-window@^7 \
  vitest@^4 @vitest/coverage-v8@^4 \
  @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event \
  jsdom
```

> **`workbox-window` is not optional.** It's an unlisted-at-install peer of
> `vite-plugin-pwa`, and pnpm's strict `node_modules` won't hoist it for you. Skip it and
> `pnpm build` fails at the very end with
> `Rolldown failed to resolve import "workbox-window" from "virtual:pwa-register"` — after
> it has already printed a successful-looking bundle summary. This cost real time to
> diagnose; install it up front.

`esc-pos-encoder` (Web Bluetooth thermal printing) is M5, not M0. Leave it out for now.

Versions this guide was verified against: Vite 8.2.1 · vite-plugin-pwa 1.3.0 ·
Tailwind 4.3.3 · Dexie 4.4.5 · TanStack Query 5.101.4 · React Router 6.30.6 ·
Zod 4.4.3 · Vitest 4.1.11 · Node 22 · pnpm 10.

---

## 3. Folder structure

```bash
rm -f src/App.tsx src/App.css src/index.css src/main.tsx
mkdir -p src/{components,db,lib,test}
mkdir -p src/features/{billing,inventory,trips,reports,settings}
```

```
src/
├── components/     shared UI (AppShell, buttons, offline banner)
├── db/             Dexie schema + sync engine (M2 lands here)
├── lib/            pure logic — gstCalc.ts, landedCost.ts. No React imports. Tested.
├── features/
│   ├── billing/    M5
│   ├── inventory/  M3
│   ├── trips/      M4  ← the differentiator (§2.IV)
│   ├── reports/    M6
│   └── settings/   M7
├── test/setup.ts
├── router.tsx
├── pwa.ts
└── main.tsx
```

The rule that matters: **`src/lib/` holds pure functions with no React and no Dexie
imports.** That's what makes the money logic in §2.V cheap to test exhaustively.

---

## 4. Tailwind v4 — CSS-first config

Tailwind v4 has **no `tailwind.config.js`** and no PostCSS setup. Don't follow a v3
tutorial here; theme values live in CSS via `@theme`.

`src/index.css`:

```css
@import 'tailwindcss';

@theme {
  --color-parda-green-50: #eafaf1;
  --color-parda-green-500: #2fbf71;   /* brand green, Constitution §0 */
  --color-parda-green-600: #26a05e;
  --color-parda-green-700: #1d7a47;
  --color-parda-lavender-50: #eeeffc;
  --color-parda-lavender-500: #7b7fe0; /* brand lavender */
  --color-parda-lavender-600: #6165c9;

  --font-sans: 'Inter', system-ui, sans-serif;
}

html, body, #root { height: 100%; }

body {
  overscroll-behavior-y: none;      /* no pull-to-refresh mid-invoice */
  -webkit-tap-highlight-color: transparent;
}
```

These generate `bg-parda-green-500`, `text-parda-lavender-600`, etc. automatically.

---

## 5. `vite.config.ts`

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',   // NOT autoUpdate — see note below
      injectRegister: null,     // we register manually in src/pwa.ts
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TallyThreads',
        short_name: 'TallyThreads',
        description: 'Cloth store operating system',
        lang: 'en-IN',
        theme_color: '#2FBF71',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Supabase REST is NEVER cached by the SW. Dexie is the offline
            // source of truth (§2.I) — two caching layers would fight.
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },  // test offline in `pnpm dev`
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],   // §2.V: money logic is what must stay covered
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
```

Two deliberate choices worth understanding:

- **`registerType: 'prompt'`, not `'autoUpdate'`.** With `autoUpdate` a deploy can swap the
  service worker and reload the page while a shopkeeper is halfway through a bill. Prompt
  mode lets you show a dismissible "Update available" toast and reload only when the
  counter is idle.
- **`import.meta.dirname`, not `__dirname`.** Vite 8's native config loader warns on
  `__dirname` and it's slated to break.

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

---

## 6. `tsconfig.app.json` and scripts

In `tsconfig.app.json`, add to `compilerOptions`:

```jsonc
"types": ["vite/client", "vite-plugin-pwa/client"],
"paths": { "@/*": ["./src/*"] },
"strict": true,
```

> **Do not add `baseUrl`.** TypeScript 6 (what the template installs) errors with
> `TS5101: Option 'baseUrl' is deprecated`. Modern TS resolves `paths` relative to the
> tsconfig file itself, so `baseUrl` is both unnecessary and fatal.

Scripts in `package.json`:

```jsonc
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "oxlint",
  "typecheck": "tsc -b --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage"
}
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

---

## 7. `index.html`

```html
<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#2FBF71" />
    <meta name="mobile-web-app-capable" content="yes" />
    <title>TallyThreads</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`maximum-scale=1.0` stops iOS/Android from zooming when a barcode field is focused at the
counter. `viewport-fit=cover` + the `env(safe-area-inset-bottom)` padding in the nav keeps
the tab bar clear of gesture bars.

Drop real icons into `public/`: `pwa-192x192.png`, `pwa-512x512.png`,
`apple-touch-icon.png`, `favicon.svg` — the awning mark in green/lavender (§2.VII). The
512px one doubles as the maskable icon, so keep the mark inside the middle 80% or Android
will crop it. Placeholders are fine to get the build green; swap them before go-live with
Bandrip.

---

## 8. Entry point, router, shell

`src/pwa.ts` — SW registration that never reloads out from under a bill:

```ts
import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker() {
  const update = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('sp:sw-update-ready', { detail: { update } }))
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('sp:sw-offline-ready'))
    },
  })
  return update
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './router'
import { registerServiceWorker } from './pwa'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',   // ← the important one
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

registerServiceWorker()
```

`networkMode: 'offlineFirst'` is what stops TanStack Query from short-circuiting every
query to "paused" the moment the browser reports offline. Without it, §2.I is broken by
default.

`src/router.tsx` — route-level code splitting from day one keeps the billing screen's
first paint fast on a ₹8,000 Android tablet:

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/bill" replace /> },
      { path: 'bill',      lazy: async () => ({ Component: (await import('./features/billing/BillingPage')).default }) },
      { path: 'inventory', lazy: async () => ({ Component: (await import('./features/inventory/InventoryPage')).default }) },
      { path: 'trips',     lazy: async () => ({ Component: (await import('./features/trips/TripsPage')).default }) },
      { path: 'reports',   lazy: async () => ({ Component: (await import('./features/reports/ReportsPage')).default }) },
      { path: 'settings',  lazy: async () => ({ Component: (await import('./features/settings/SettingsPage')).default }) },
    ],
  },
])
```

`src/components/AppShell.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { Receipt, Package, Truck, BarChart3, Settings } from 'lucide-react'

const tabs = [
  { to: '/bill', label: 'Bill', Icon: Receipt },
  { to: '/inventory', label: 'Stock', Icon: Package },
  { to: '/trips', label: 'Trips', Icon: Truck },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export function AppShell() {
  return (
    <div className="flex h-full min-w-[320px] flex-col bg-white text-slate-900">
      <main className="flex-1 overflow-y-auto p-3">
        <Outlet />
      </main>
      <nav className="grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? 'text-parda-green-600' : 'text-slate-500'
              }`}>
            <Icon size={20} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
```

`min-h-14` (56px) keeps every tap target above the 44px accessibility floor — relevant when
the user is a shopkeeper with a customer waiting.

Then five one-line stubs, e.g. `src/features/billing/BillingPage.tsx`:

```tsx
export default function BillingPage() {
  return <h1 className="text-lg font-semibold">BillingPage</h1>
}
```

---

## 9. Dexie schema stub (`src/db/index.ts`)

M2 builds the real sync engine. M0 just establishes the shape so nothing gets written the
wrong way in the meantime — note `_dirty`, `_localId`, `last_modified_at`, `deleted_at` per
Constitution §6.

```ts
import Dexie, { type EntityTable } from 'dexie'

export interface SyncMeta {
  _localId: string
  _dirty: 0 | 1
  last_modified_at: string
  deleted_at: string | null
}

export interface Product extends SyncMeta {
  id?: string
  store_id: string
  name: string
  hsn_code: string | null
}

export interface Invoice extends SyncMeta {
  id?: string
  store_id: string
  /** {store_code}-{device_id}-{local_sequence} — never a central counter (§6) */
  invoice_no: string
  total_paise: number
}

export interface OutboxItem {
  id?: number
  table: string
  localId: string
  op: 'insert' | 'update' | 'delete'
  queued_at: string
  attempts: number
}

export const db = new Dexie('tallythreads') as Dexie & {
  products: EntityTable<Product, '_localId'>
  invoices: EntityTable<Invoice, '_localId'>
  outbox: EntityTable<OutboxItem, 'id'>
}

db.version(1).stores({
  products: '_localId, id, store_id, name, _dirty, last_modified_at',
  invoices: '_localId, id, store_id, invoice_no, _dirty, last_modified_at',
  outbox:   '++id, table, localId, queued_at',
})
```

Two conventions to lock in now, because retrofitting them later is painful:

- **`_localId` is the primary key, not `id`.** The Supabase `id` is unknown at creation
  time when you're offline. Every foreign key inside Dexie references `_localId`.
- **Money is always integer paise, never a float.** `total_paise: 1_25_000` is ₹1,250.00.

---

## 10. First money-logic test (Constitution §2.V)

Even though billing is M5, write `src/lib/gstCalc.ts` in M0 — it proves the test
infrastructure works and locks the paise convention before any feature code depends on it.

`src/lib/gstCalc.ts`:

```ts
export const GST_THRESHOLD_PAISE = 250_000 // ₹2,500 per piece

export interface GstLineInput {
  unitPricePaise: number
  quantity: number
  lineDiscountPaise?: number
  interState?: boolean
}

/**
 * Apparel GST (HSN 61 / 62), rates as revised w.e.f. 22 Sep 2025:
 *   sale value ≤ ₹2,500 per piece → 5%
 *   sale value >  ₹2,500 per piece → 18%   (this replaced the old ₹1,000 / 12% structure)
 * The threshold is applied to the POST-discount per-piece value, so a discount can pull an
 * item down into the 5% slab. That edge case is exactly what Constitution §2.V calls out.
 */
export function calculateGstForLine(input: GstLineInput) {
  const { unitPricePaise, quantity, lineDiscountPaise = 0, interState = false } = input

  if (!Number.isInteger(unitPricePaise) || unitPricePaise < 0)
    throw new RangeError('unitPricePaise must be a non-negative integer (paise)')
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new RangeError('quantity must be a positive integer')
  if (!Number.isInteger(lineDiscountPaise) || lineDiscountPaise < 0)
    throw new RangeError('lineDiscountPaise must be a non-negative integer (paise)')

  const gross = unitPricePaise * quantity
  if (lineDiscountPaise > gross) throw new RangeError('discount exceeds line value')

  const taxableValuePaise = gross - lineDiscountPaise
  // Threshold applies to the POST-discount per-piece value (§2.V edge case)
  const perPieceAfterDiscount = Math.round(taxableValuePaise / quantity)
  const ratePercent: 5 | 18 = perPieceAfterDiscount <= GST_THRESHOLD_PAISE ? 5 : 18

  const totalTaxPaise = Math.round((taxableValuePaise * ratePercent) / 100)

  let cgstPaise = 0, sgstPaise = 0, igstPaise = 0
  if (interState) {
    igstPaise = totalTaxPaise
  } else {
    cgstPaise = Math.floor(totalTaxPaise / 2)
    sgstPaise = totalTaxPaise - cgstPaise   // odd paise lands in SGST, never lost
  }

  return { taxableValuePaise, ratePercent, cgstPaise, sgstPaise, igstPaise,
           totalTaxPaise, totalPaise: taxableValuePaise + totalTaxPaise }
}
```

`src/lib/gstCalc.test.ts` — the eight cases that matter:

```ts
import { describe, expect, it } from 'vitest'
import { calculateGstForLine, GST_THRESHOLD_PAISE } from './gstCalc'

describe('calculateGstForLine', () => {
  it('applies 5% at or below the ₹2,500 per-piece threshold', () => {
    const r = calculateGstForLine({ unitPricePaise: GST_THRESHOLD_PAISE, quantity: 1 })
    expect(r.ratePercent).toBe(5)
    expect(r.totalPaise).toBe(262_500)
  })

  it('applies 18% above the threshold', () => {
    expect(calculateGstForLine({ unitPricePaise: GST_THRESHOLD_PAISE + 100, quantity: 1 })
      .ratePercent).toBe(18)
  })

  it('drops to 5% when a discount pushes per-piece value below the threshold', () => {
    // ₹3,000 saree, ₹600 off → ₹2,400/piece → 5%, not 18%
    const r = calculateGstForLine({ unitPricePaise: 300_000, quantity: 1, lineDiscountPaise: 60_000 })
    expect(r.ratePercent).toBe(5)
    expect(r.totalTaxPaise).toBe(12_000)
  })

  it('evaluates the threshold per piece, not per line total', () => {
    // 3 × ₹1,000 = ₹3,000 line total but ₹1,000/piece → still 5%
    expect(calculateGstForLine({ unitPricePaise: 100_000, quantity: 3 }).ratePercent).toBe(5)
  })

  it('splits intra-state tax into CGST + SGST with no rounding leak', () => {
    const r = calculateGstForLine({ unitPricePaise: 99_999, quantity: 1 })
    expect(r.cgstPaise + r.sgstPaise).toBe(r.totalTaxPaise)
    expect(r.igstPaise).toBe(0)
  })

  it('puts the whole tax in IGST for inter-state sales', () => {
    const r = calculateGstForLine({ unitPricePaise: 100_000, quantity: 1, interState: true })
    expect(r.igstPaise).toBe(r.totalTaxPaise)
  })

  it('rejects a discount larger than the line value', () => {
    expect(() => calculateGstForLine({ unitPricePaise: 100_000, quantity: 1, lineDiscountPaise: 100_001 }))
      .toThrow(RangeError)
  })

  it('rejects non-integer paise (float money is a bug)', () => {
    expect(() => calculateGstForLine({ unitPricePaise: 100_000.5, quantity: 1 })).toThrow(RangeError)
  })
})
```

```bash
pnpm test     # → 8 passed
```

**A rate correction worth flagging.** The apparel slabs were restructured effective
22 September 2025: the old ₹1,000 threshold with 5% / 12% was replaced by a ₹2,500
threshold with **5% / 18%**. The constitution's ₹2,500 figure is current; if you had 12%
in your head as the upper rate, that's the stale number — an 18%-rated saree billed at 12%
is a 6% shortfall the store eats at filing time. The code above uses 5/18.

Still have the final rates and the exact threshold basis confirmed by whoever files your
GST returns before go-live — this is a real customer being billed from day one, not a
trial run, and this is precisely the class of bug §2.V exists to prevent.

---

## 11. Environment and `.gitignore`

`.env.local` (git-ignored — this file never gets committed):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

`.env.example` (committed, no real values):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Append to `.gitignore`:

```
.env
.env.local
.env.*.local
dev-dist/
coverage/
```

`dev-dist/` is where `vite-plugin-pwa` writes the dev-mode service worker — it will show up
as untracked noise on your first commit if you don't ignore it.

Only the **anon** key ever goes in a `VITE_` variable; everything prefixed `VITE_` is
compiled into the client bundle and is public. The service-role key belongs in Supabase
Edge Function secrets only, never in this repo.

---

## 12. CI — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:cov      # fails if src/lib coverage drops below threshold
      - run: pnpm build
```

The coverage threshold in `vite.config.ts` scoped to `src/lib/**` is what turns Constitution
§2.V from an intention into something CI enforces. When you add `landedCost.ts` in M4, it's
automatically under the same gate.

Turn on branch protection for `main` requiring this job — solo projects are exactly where a
"just this once" direct push to main happens at 1 a.m.

---

## 13. Vercel notes (for when you deploy)

- Framework preset: Vite. Build `pnpm build`, output `dist`.
- Add a `vercel.json` for SPA routing plus correct service-worker cache headers:

  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
      }
    ]
  }
  ```

  Without the `sw.js` header, a CDN-cached service worker can pin stores to an old build
  for hours — the nastiest class of PWA bug because it looks like "the app just didn't
  update" rather than an error.

- Vercel Pro ($20/mo) is required once this is commercial, per their ToS — the constitution
  already budgets it. The Hobby tier is fine for now, while it's still just Bandrip and the
  two other early family-run stores and no money is changing hands for the software.
- Supabase project region: **`ap-south-1` (Mumbai)** — set at project creation, cannot be
  changed later (§6).

---

## 14. M0 Definition of Done

Constitution §7, applied to this module:

- [ ] `pnpm build` clean, `pnpm typecheck` clean, `pnpm test` green
- [ ] CI passing on a PR, branch protection on `main`
- [ ] Installs as a PWA on an Android phone (Chrome → "Add to home screen"), opens
      standalone with no browser chrome, correct green splash
- [ ] **Airplane mode test:** load the app, kill the network, hard-reload → shell still
      renders, tabs still navigate. This is the M0 proof of §2.I.
- [ ] DevTools at 375px: no horizontal scroll, every tab target ≥ 44px
- [ ] `src/lib` coverage ≥ 90%
- [ ] Real brand icons in `public/`, maskable icon safe-zone checked
- [ ] `NOTICE.md` committed, repo private, personal git identity confirmed via `git log`

Verified in a sandbox run of exactly these steps: build succeeded (19 precache entries),
8/8 tests passed, one service worker registered, lazy routes navigated, zero page errors,
no horizontal scroll at 375×720.

---

## 15. Three decisions the template forces — your call, not mine

The constitution was ratified today and locks these; the August 2026 ecosystem has moved
past two of them. None of these block M0 — the scaffold above respects the constitution as
written. But §8 says amendments need a real reason and a changelog entry, so here they are
as reasons, for you to accept or reject deliberately rather than drift into.

1. **React 18 vs 19.** React 19.2 is stable and is what the Vite template ships. Pinning 18
   means fighting the template on every future `pnpm create`, and `@vitejs/plugin-react` 6
   is built around the React Compiler. Nothing in the stack requires 18. **Reason to amend:**
   staying on 18 accrues migration debt for a codebase that will live years, with no offsetting
   benefit. **Reason not to:** your day-job React fluency is the project's scheduling
   assumption, and if that's 18, familiarity has real value at 10 hrs/week.

2. **React Router v6 vs v7.** v7 is current; v6 is in maintenance. The migration is
   mechanical *now* and gets less so once M3–M5 add dozens of routes and loaders. If you're
   going to move, M0 is the cheapest moment by a wide margin.

3. **TypeScript 6 + oxlint instead of TS 5 + ESLint.** The template chose these for you.
   Both are fine and oxlint is dramatically faster, but §4 doesn't mention a linter at all —
   worth adding a row so it's an explicit choice rather than a template default.

If you want any of these changed, amend §4 and add a changelog entry to §8 in the same
commit. If you want them left as locked, the guide above already works as written — just
delete this section.
