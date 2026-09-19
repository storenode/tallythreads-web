# TallyThreads

**A cloth-store operating system (PWA) for Indian garment retailers** — independent,
multi-store chain, and franchise. Not a generic POS with a garment skin: every screen is
built around how a cloth store actually sources, stocks, and sells. The signature flow is
**Purchase-Trip → landed cost** for owners who travel to source stock (Surat, Kerala,
Bangladesh…), with GST-correct billing, offline-first operation, and a franchise settlement
engine for groups like the launch customer, Bandrip.

> The full rationale, scope, and non-goals live in **[`specs/`](specs/README.md)** — start
> with [`specs/constitution.md`](specs/constitution.md) (binding) and
> [`specs/roadmap/status.md`](specs/roadmap/status.md) (what's built). This README is the
> technical setup + architecture guide.

---

## Tech stack

| Area | Choice |
|---|---|
| UI | React 18, TypeScript, Vite 8, Tailwind CSS v4 |
| Routing / data | react-router-dom v6, TanStack Query, TanStack Table |
| Forms | react-hook-form + Zod |
| Offline / local DB | Dexie (IndexedDB) with a write-through + outbox sync engine |
| PWA | vite-plugin-pwa (Workbox) |
| Backend | Supabase — Postgres + RLS, Auth, Storage, Edge Functions (Deno) |
| Lint / test | Oxlint, Vitest + Testing Library |

## Architecture at a glance

- **Offline-first.** Every write path goes through Dexie first (`src/db`, `src/sync`), then a
  background outbox pushes to Supabase — so the counter keeps working with no connection
  (constitution §2.I).
- **Custom member identity, not `auth.users`.** Google is only the sign-in handshake.
  `mint-member-session` reads the Google profile, upserts a **`members`** row (keyed on
  Google's stable `sub`), and mints **TallyThreads's own JWT** (`sub = members.id`,
  `role: authenticated`, HS256). The app client (`src/lib/supabaseClient.ts`) plugs that JWT
  in via `accessToken`, so **`auth.uid()` in every RLS policy resolves to `members.id`**.
- **Device-gated PIN.** Each device enrolls a PIN (`devices`, `set-pin`/`verify-pin`) for fast
  repeat login; session + PIN share a 30-day window.
- **RBAC → entitlements.** `roles` / `permissions` / `role_permissions` at platform / org /
  store scope, resolved to entitlements and enforced both client-side (`hasPermission`) and in
  RLS (`is_platform_admin` / `has_org_permission` / `has_store_permission`). Catalog:
  [`specs/reference/roles-and-permissions.md`](specs/reference/roles-and-permissions.md).
- **Live DB is the schema source of truth.** [`specs/reference/schema.md`](specs/reference/schema.md)
  is kept to match it (`supabase db dump --linked --schema public`).

## Repository layout

```
src/
  features/        Feature areas (each with its own routes/nav/data)
    admin/         Platform console — organizations, setup wizard, roles, demo tooling
    auth/          Google sign-in, PIN, guards, entitlements
    stores/        Org self-service console (organizations, stores, setup wizard)
    warehouses/    Stock rooms (org-owned storage) + placement
    inventory/     Stock placement (stock_locations tree)
    purchaseTrips/ Purchase-Trip → landed cost
    operations/    Store-scoped Operations shell (/ops/:storeId) — tabs are stubs
  db/              Dexie schema + offline data access
  sync/            Outbox sync engine
  lib/             Supabase client (member-JWT), env, session
  layouts/, components/, hooks/

supabase/
  migrations/      SQL migrations (source of truth = the live DB)
  functions/       Edge Functions (Deno): mint-member-session, set-pin, verify-pin,
                   demo-login, extract-receipt, _shared
  config.toml      Local Supabase config
  seed/, schema.mmd

specs/             The project's brain — constitution, reference, roadmap, journal
```

---

## Prerequisites

- **Node** 20+ and **pnpm**
- **Supabase CLI** (`supabase`) — bundled as a dev dependency; use `pnpm supabase …`
- **Docker** — only for running the local Supabase stack / `supabase db dump`
- A **Supabase project** (hosted) and a **Google Cloud OAuth** client

## Local setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the two values below
pnpm dev                     # http://localhost:5173
```

`.env.local` (client, Vite-exposed — safe to ship, they're public keys):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

Verify connectivity any time with `pnpm supabase:check`.

## Supabase + Google OAuth setup

The app uses Google **only** to bootstrap identity, then swaps in its own JWT. Setup has three
parts:

**1. Google Cloud — OAuth credentials**
- Create an **OAuth consent screen** and an **OAuth 2.0 Client ID** (type: Web application).
- Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Copy the **Client ID** and **Client secret**.

**2. Supabase — Auth provider + redirect URLs**
- In the Supabase dashboard → **Authentication → Providers → Google**: enable it and paste the
  Client ID / secret. (Google is configured in the hosted dashboard, not `config.toml`.)
- **Authentication → URL Configuration**: set **Site URL** and **Additional Redirect URLs** to
  your app origins (e.g. `http://localhost:5173` for dev, plus your deployed URL).

**3. Edge Function secrets** (the custom-JWT + receipt-OCR backend)

```bash
pnpm supabase:login
supabase link --project-ref <project-ref>

supabase secrets set \
  APP_JWT_SECRET="<your Supabase project's JWT secret>" \
  ANTHROPIC_API_KEY="<key for extract-receipt OCR>"
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into functions.
```

> **Critical:** `APP_JWT_SECRET` **must equal your Supabase project's JWT secret**
> (Settings → API → JWT Settings). The minted member token is HS256-signed with it, and
> PostgREST verifies incoming tokens with the project secret — if they differ, every
> authenticated request fails RLS. (It can't be named `SUPABASE_JWT_SECRET`; that prefix is
> reserved by the platform.)

**4. Apply migrations + deploy functions**

```bash
pnpm supabase:db:push      # apply supabase/migrations to the linked project
pnpm supabase:fn:deploy    # deploy all edge functions
```

### Auth flow (what happens at sign-in)

```
Google sign-in (plain supabase-js auth client)
      ↓  OAuth redirect round-trip
mint-member-session  →  upsert members (by Google sub) + devices row
      ↓  returns TallyThreads JWT (sub = members.id, HS256/APP_JWT_SECRET)
app supabase client uses it as accessToken  →  auth.uid() = members.id in RLS
      ↓
device PIN set/verify (set-pin / verify-pin) for fast repeat login
```

---

## Commands

```bash
pnpm dev            # run the app (Vite, :5173)
pnpm build          # tsc -b && vite build
pnpm preview        # preview the production build
pnpm test           # vitest (run once)   ·   pnpm test:watch   ·   pnpm test:cov
pnpm typecheck      # tsc -b --noEmit
pnpm lint           # oxlint

pnpm supabase:check       # verify Supabase connection
pnpm supabase:db:push     # push migrations
pnpm supabase:fn:deploy   # deploy edge functions
```

## Non-negotiables (constitution §9, §2)

- **No file or code changes without the founder's explicit go-ahead.**
- **The live Supabase DB is the schema source of truth**; keep `specs/reference/schema.md` in sync.
- **Test the money logic** — GST, landed cost, franchise settlement (§2.V).
- **Offline-first**: every write path goes through Dexie first (§2.I).
- **Mobile-first PWA**: follow the UI & Responsive Rules (§6) — global type scale in
  `src/index.css`, 16px form controls, `env(safe-area-inset-*)` on sticky chrome, no
  horizontal page scroll.
- End each working session with a dated entry in `specs/journal/YYYY-MM.md`.

## Learn more

- [`specs/constitution.md`](specs/constitution.md) — rules, vision, scope (binding)
- [`specs/roadmap/status.md`](specs/roadmap/status.md) — what's built / what's next
- [`specs/reference/`](specs/reference/) — schema, roles & permissions, franchise settlement
- [`specs/journal/`](specs/journal/) — dated dev log
