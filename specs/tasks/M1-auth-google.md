# M1-auth-google — Google Sign-In

**Status:** In Progress
**Version:** 1.12.0
**Est:** TBD
**Tracking:** [Issue #27](https://github.com/storenode/tallythreads-web/issues/27)

## What this is

TallyThreads needs a way for a store owner (and later, staff) to sign in before they can
bill customers or manage inventory. This task adds **Google Sign-In** as that first
login method: a store user clicks "Sign in with Google," authenticates with their
Google account, and lands inside the authenticated app shell (`/app/*`) with their name
and photo visible.

Under the hood, this task does something slightly unusual on purpose — this is a
locked founder decision, not open for debate in this doc: Supabase's built-in Google
OAuth handshake is used only as a *credential check*, not as TallyThreads's actual
identity system. Supabase's own `auth.users` table is treated as disposable plumbing
that OAuth inevitably creates — no application code ever reads from it. Instead,
immediately after Google confirms who the person is, a small server-side function (a
Supabase Edge Function) looks up or creates a row in TallyThreads's own `members` table
(name, email, avatar) and mints TallyThreads's own access token for that member. That
token — not anything from `auth.users` — is what the app uses from then on. This keeps
`members` as the single source of truth for "who is this person," independent of
whatever Supabase's OAuth plumbing internally does, and leaves room for a second,
non-Google login method (a one-time emailed code) to reuse the exact same `members`
row and token scheme without a schema change.

This is a **spec-only deliverable this round** — no code is written yet. The founder
reads this, adjusts anything that needs adjusting (see the open questions at the end),
and implementation happens in a follow-up pass once it's greenlit.

## Scope

**In scope for this task:**
- The `members` table (schema below), including a reserved-but-unused column for the
  future one-time code
- Google Cloud Console configuration (OAuth consent screen + credentials)
- Supabase dashboard configuration (enabling the Google provider)
- The Edge Function that exchanges a completed Google OAuth handshake for a
  TallyThreads-issued JWT
- Client-side sign-in wiring: `GoogleSignInButton` becomes functional, session gets
  cached locally, `/app/*` gets a real route guard
- Sign-out
- The offline-after-sign-in behavior described below

**Explicitly deferred, NOT built in this task:**
- **Email one-time-code sign-in** — a separate follow-up task, in the same naming
  series (`M1-auth-email-otp.md` or similar), not yet created. This task only
  *reserves the column* in `members` so that follow-up doesn't need a migration.
- **React Native / mobile client use of the same code** — mentioned by the founder as
  future context for *why* the OTP column exists (the code should work identically as
  a login credential from a future Android client, not just the web). No mobile work
  happens here or in the OTP follow-up; it's a later module entirely.
- **Row-level security (RLS) policies** — the constitution's M1 roadmap line bundles
  "Supabase schema, RLS, Auth" together, but this task only creates the `members`
  table and the auth flow around it. Store-scoped RLS policies for
  `products`/`invoices`/other business tables are a separate follow-up task — flagged
  as an open question below.
- **Phone OTP** — the constitution's M1 line also mentions phone OTP; per the
  founder's current instructions, phone auth is not being pursued right now (email OTP
  replaces it in the near-term roadmap). Not addressed here.
- **Offline sync engine (Dexie ⇄ Supabase push/pull)** — that's M2, not started. This
  task caches the member profile and token for offline *reads*, but does not build the
  generic bidirectional sync engine. See "Offline-first" below for exactly what that
  means in practice.
- **Multi-user / staff roles, permissions, invitations** — `members` here models one
  row per person who has ever signed in; roles/permissions are not modeled here.
- **"Logout everywhere" / session revocation UI** — flagged as an open question below.

## `members` table schema

### Postgres (Supabase)

```sql
create table members (
  id                uuid primary key default gen_random_uuid(),
  google_id         text not null,   -- Google's stable "sub" claim — see note below
  google_email      text not null,
  email_verified    boolean not null default false,
  first_name        text,
  last_name         text,
  avatar_url        text,
  locale            text,
  pin               text,              -- reserved for the email-OTP follow-up task; unused/null for now
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Superseded by 20260820020529_fix_members_google_id_constraint.sql — see v1.11.0
-- changelog entry. A plain `.upsert(..., { onConflict: "google_id" })` needs an
-- unconditional unique constraint as its ON CONFLICT arbiter; this partial index
-- (silently) can't serve as one, which broke every sign-in with a 500 until fixed.
create unique index members_google_id_idx on members (google_id) where deleted_at is null;
create index members_google_email_idx on members (google_email) where deleted_at is null;

-- What's actually live now:
alter table members add constraint members_google_id_key unique (google_id);
```

Notes:
- `id` is server-generated (see open question below on whether this should instead be
  client-generated like `_localId`, following the pattern used elsewhere).
- **`google_id` (Google's OpenID `sub` claim), not `google_email`, is the real dedup
  key.** `sub` is Google's permanent, immutable identifier for the account; email is
  mutable (a person can change the email on their Google account, or in rare cases an
  email can be reassigned), so keying on it risks either duplicate rows or the wrong
  row being matched later. `google_email` stays on the row — indexed, but not
  unique — for display/contact/search, not identity.
- `email_verified` is a boolean straight from Google's identity payload (Google itself
  attests it verified that address) — cheap to keep, useful later if TallyThreads ever
  needs to trust the email for something like the OTP follow-up flow.
- `locale` (e.g. `en-IN`) is available from Google's basic profile scope at no extra
  cost — kept in case it's useful for future i18n, not used by anything in this task.
- `pin` is nullable and untouched by this task; it exists now purely so the OTP
  follow-up task is a code change, not a migration.
- `last_modified_at` / `deleted_at` follow Constitution §6's mandatory convention
  verbatim — no hard deletes, last-write-wins conflict resolution keyed on
  `last_modified_at`.
- No `store_id` column — a `member` is a login identity, not scoped to one store in
  this task. If/when multi-store or staff-per-store modeling is needed, that's a later
  join table, not a column here.

**What Google actually gives us — and what it doesn't.** The `email`/`profile`/`openid`
scopes above are all standard OpenID Connect claims, returned in the ID token / from
Google's userinfo endpoint on every sign-in: `sub` (→ `google_id`), `email`,
`email_verified`, `name`, `given_name` (→ `first_name`), `family_name` (→
`last_name`), `picture` (→ `avatar_url`), `locale`. That's the complete set — there
isn't a broader "Google notification channel" available from a basic Sign-In
integration. Google doesn't expose a generic push-notification channel through OAuth;
the only way to *reach* a member via Google itself would be sending email to their
`google_email` (ordinary email, nothing special), and anything like browser/mobile
push notifications is a separate, unrelated feature (Web Push API on the PWA side, or
Firebase Cloud Messaging for a future Android client) — not something Google Sign-In
grants access to, and out of scope for this task.

### Dexie (client)

Following the exact `SyncMeta` + entity pattern already used by `Product`/`Invoice` in
`src/db/index.ts`:

```ts
export interface Member extends SyncMeta {
  id?: string; // server UUID — set immediately after the Edge Function responds,
               // not left pending like a normal optimistic write
  google_id: string;
  google_email: string;
  email_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  pin: string | null; // reserved, unused
}
```

Added to the Dexie schema as a new `members` table, `db.version(2)` (bumping from the
existing version 1):

```ts
db.version(2).stores({
  products: "_localId, id, store_id, name, _dirty, last_modified_at",
  invoices: "_localId, id, store_id, invoice_no, _dirty, last_modified_at",
  outbox: "++id, table, localId, queued_at",
  members: "_localId, id, google_id, _dirty, last_modified_at",
});
```

Important scoping note: this task only ever writes **one** `members` row locally —
the signed-in user's own cached profile. It does not sync the full `members` table
bidirectionally (no other member's data is ever pulled to a device) — that generalized
sync engine is M2's job. Here, the local `members` row is used narrowly as "cache slot
for my own profile," written directly by the Edge Function response, not through the
`outbox`/`_dirty` push pipeline (the member never edits their own profile in this
task, so `_dirty` is expected to stay `0` in practice — it's included in the schema
mainly so the shape is sync-ready per §6, and so a future "edit my profile" feature
doesn't need another migration).

## Google Cloud Console setup steps

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**. If
   TallyThreads doesn't already have a Google Cloud project, create one (project
   dropdown, top left → **New Project** → name it e.g. `tallythreads`).
2. **Configure the OAuth consent screen:**
   - Left sidebar → **APIs & Services** → **OAuth consent screen**
   - User type: **External** (unless the founder has a Google Workspace org and wants
     **Internal** — see open questions)
   - App name: `TallyThreads`
   - User support email: the founder's email
   - App logo: optional, can skip for now
   - Authorized domains: add the production domain once it exists (can be left blank
     during development against `localhost`)
   - Developer contact email: the founder's email
   - Scopes: add `email`, `profile`, `openid` (the defaults needed to read the fields
     `members` stores — no sensitive/restricted scopes needed)
   - Test users (while the app is in "Testing" publish status): add the founder's own
     Google account and any other accounts that need to sign in before the consent
     screen is published/verified
3. **Create OAuth 2.0 credentials:**
   - Left sidebar → **APIs & Services** → **Credentials** → **+ Create Credentials** →
     **OAuth client ID**
   - Application type: **Web application**
   - Name: `TallyThreads Web (Supabase)`
   - **Authorized JavaScript origins:** add `http://localhost:5173` (Vite dev server
     default) and the production PWA origin once deployed (e.g.
     (domain not yet decided under the TallyThreads name))
   - **Authorized redirect URIs:** add the Supabase callback URL — this is
     `https://<your-project-ref>.supabase.co/auth/v1/callback` (the exact value is
     also shown by Supabase in the dashboard steps below; add it here after copying it
     from there)
   - Click **Create**
4. Google now shows a **Client ID** and **Client Secret** — copy both. These are
   pasted into the Supabase dashboard next, never into this repo.

## Supabase dashboard setup steps

1. Go to **[supabase.com/dashboard](https://supabase.com/dashboard)** and open the
   TallyThreads project (same project already connected in M0.6).
2. **Authentication** (left sidebar) → **Providers** → find **Google** in the provider
   list → toggle it **Enabled**.
3. Paste the **Client ID** and **Client Secret** copied from Google Console (above)
   into the corresponding fields.
4. Supabase displays its own **Callback URL (for OAuth)** on this same screen — it's
   the `https://<your-project-ref>.supabase.co/auth/v1/callback` URL referenced above.
   Copy it now if it wasn't already added to Google Console's authorized redirect
   URIs — both sides must match exactly.
5. Click **Save**.
6. **Authentication** → **URL Configuration**:
   - **Site URL:** set to the app's primary origin (production URL once deployed;
     `http://localhost:5173` during development)
   - **Redirect URLs:** add every origin the OAuth flow may redirect back to —
     `http://localhost:5173/**` for dev, the production origin
     (domain not yet decided under the TallyThreads name)/** once deployed. This is what Supabase checks
     against the `redirectTo` the client passes to `signInWithOAuth`, so a mismatch
     here causes silent redirect failures.
7. No changes needed to **JWT Settings** — the project's existing JWT secret (already
   provisioned by Supabase) is reused by the Edge Function to sign TallyThreads's own
   JWT (see below). Note the secret's location for the next section: **Project
   Settings → API → JWT Settings → JWT Secret** — this value is copied into an Edge
   Function secret, never into `.env.local` or the repo.

## Repo-managed Supabase folder

Schema migrations and Edge Functions are managed in this repo, in a `supabase/`
directory at the project root, using the Supabase CLI already installed in M0.6
(`pnpm add -D supabase`) — not hand-applied through the dashboard UI, so changes are
versioned, reviewable, and reproducible on any machine (or in CI later).

1. **One-time init** (if `supabase/` doesn't exist yet): `supabase init` at the repo
   root. This creates `supabase/config.toml` and the `supabase/migrations/` and
   `supabase/functions/` directories.
2. **Link to the remote project** (per M0.6's "remote-only, by design" — there is no
   local Docker Postgres in this workflow): `supabase link --project-ref <project-ref>`,
   using the same project already configured in `.env.local`. This only needs doing
   once per machine.
3. **Migrations** live in `supabase/migrations/<timestamp>_<name>.sql` — plain SQL
   files, one per schema change, applied in filename order. This task adds
   `supabase/migrations/<timestamp>_create_members.sql` containing the `members`
   table DDL from above. Create with `supabase migration new create_members`, then
   fill in the SQL; apply to the remote project with `supabase db push`.
4. **Edge Functions** live in `supabase/functions/<function-name>/index.ts` — one
   directory per function. This task adds `supabase/functions/mint-member-session/`.
   Create with `supabase functions new mint-member-session`, then write the logic
   described below; deploy with `supabase functions deploy mint-member-session`.
5. **Edge Function secrets** (the JWT secret, the service-role key) are set against
   the remote project directly — `supabase secrets set APP_JWT_SECRET=<value>` —
   never written to a file in this repo, migration, or function source. `supabase
   secrets list` shows which secrets are set (names only, not values) as a sanity
   check.
6. A `pnpm supabase:types` script (new, alongside the existing `pnpm supabase:check`
   from M0.6) is worth adding once `members` exists, to generate TypeScript types from
   the live schema (`supabase gen types typescript --project-id <ref>`) — keeps the
   Dexie `Member` interface and any Supabase query code honest against the real
   column set. Not required to complete this task, but flagged here so it isn't
   forgotten.

## Edge Function design

**Name:** `mint-member-session` (proposed; final naming can change at implementation
time).

**Trigger:** Called by the client immediately after
`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })`
completes its redirect round-trip and the client has a Supabase-managed session (i.e.,
called from the app's OAuth-callback landing point, not from a server-side webhook).

**What it does, in order:**
1. Receives the caller's current Supabase-managed access token (the one
   `auth.users`-backed session produced by the OAuth handshake) as its auth header,
   exactly like any other authenticated Edge Function call.
2. Uses the Supabase Admin/service-role client (server-side only, using the
   service-role key already established as an Edge Function secret per M0.6's notes)
   to read that caller's `auth.users` row / the OAuth identity payload — extracting
   the full identity claim set: `sub` (→ `google_id`), `email`, `email_verified`,
   `given_name`, `family_name`, `picture` (→ `avatar_url`), `locale`. All of these are
   standard OpenID Connect claims already included in the identity data the OAuth
   handshake produces — no extra Google scopes or API calls needed beyond what's
   configured in the Google Console setup above.
3. Upserts a `members` row keyed on `google_id` (the stable identifier, not the
   mutable email — see the schema notes above): if a row with that `google_id`
   already exists, update `google_email`/`email_verified`/`first_name`/`last_name`/
   `avatar_url`/`locale`/`last_modified_at`; if not, insert a new row (new `id`
   generated by Postgres default).
4. Mints a custom JWT: standard Supabase JWT claim shape, but with `sub` set to the
   `members.id` UUID (not the `auth.users` id), signed using the project's JWT secret
   (read from an Edge Function secret, e.g. `APP_JWT_SECRET` — **never**
   committed to the repo, set via `supabase secrets set` against the live project
   only).
5. Returns
   `{ jwt, member: { id, google_id, google_email, email_verified, first_name, last_name, avatar_url, locale } }`
   to the client.

**Client-side swap:** on receiving the response, the client stores the newly minted
JWT via `src/lib/memberSession.ts` (`localStorage`) and the Supabase client (see
`src/lib/supabaseClient.ts`) is configured with an `accessToken` callback that reads
it — supabase-js's documented mechanism for a custom, non-Supabase-issued token, used
instead of `auth.setSession()` because that API expects a matching Supabase-issued
refresh token, which this JWT doesn't have. All subsequent Supabase requests (and
`auth.uid()` inside RLS policies, once those exist) resolve against `members.id`. The
client also writes the returned member profile into the local `members` Dexie table.
The JWT itself is **not** stored in Dexie — see "Offline-first" below for where it
lives and why.

**Secrets involved, and where they live:**
- `APP_JWT_SECRET` — Edge Function secret only, set via Supabase CLI/dashboard,
  never in `.env.local` or the repo
- Service-role key — already an Edge Function secret per constitution/M0.6
  conventions, reused here, not newly introduced

## Offline-first

Signing in itself is fundamentally a network operation — Google's OAuth handshake and
the Edge Function call both require connectivity, and there is no way around that;
this is an explicit, acceptable exception to Constitution §2.I, not a violation of it,
because §2.I's guarantee is about *billing at the counter*, not about the one-time act
of logging in.

**What gets cached after a successful sign-in**, so the *offline-first billing
guarantee actually holds afterward*:
- The full member profile returned by the Edge Function (`id`, `google_id`,
  `google_email`, `email_verified`, `first_name`, `last_name`, `avatar_url`, `locale`)
  is written to the local Dexie `members` table (above), the same durable IndexedDB
  store `products`/`invoices` already use — not `localStorage`, so it survives and
  behaves consistently with the rest of the offline data model.
- The TallyThreads-minted JWT is **not** stored in Dexie — Dexie holds data records that
  mirror Supabase tables and flow through the `_dirty`/outbox sync pattern; a bearer
  credential isn't a data record and doesn't belong there. Instead it's kept wherever
  `supabase-js` already persists a session by default (`localStorage`, via
  `supabase.auth.setSession(...)`), consistent with how the SDK is meant to be used
  and requiring no custom storage code. Exact expiry/refresh handling for that stored
  JWT is flagged as an open question below.

**UX for someone who has never signed in, opening the app offline:**
- The public `/` portal (`HomePage`) still works — it's static, no data dependency,
  already the case today.
- Attempting to reach `/app/*` finds no cached member profile in Dexie (and no stored
  session token), so the route guard (below) redirects to `/`. There is nothing else
  it can reasonably do — a first sign-in has a hard network dependency (§2.I
  explicitly does not promise offline sign-*up*, only offline *billing* for
  already-onboarded users).

**UX for a returning user, opening the app offline after a prior successful sign-in:**
- The route guard reads the cached member profile from Dexie and the persisted
  session token from where `supabase-js` keeps it (`localStorage` — a local,
  synchronous read either way, no network call), finds both valid, and renders
  `/app/*` normally with the cached name/avatar shown in the shell. Billing,
  inventory, etc. proceed exactly as offline-first already promises for those
  features (independently of this task — M2 builds the actual data sync, this task
  only ensures *auth* doesn't block that experience).
- No attempt is made to validate the token against the network while offline —
  validity checking against Supabase (e.g. for an expired/rotated token) happens
  opportunistically once connectivity returns, not as a gate on rendering the shell.
  Exact expiry/refresh handling is flagged as an open question below.

## Route-guard design for `/app/*`

Replaces the current fully-open router in `src/router.tsx` (a comment there already
points at M1 for this).

- A `requireMember` loader (or a wrapping `<AuthGuard>` component around
  `<AppShell/>`, whichever fits `react-router-dom` v6's data-router pattern already in
  use) runs before rendering any `/app/*` route.
- It performs an **offline-capable check only**: read the cached `members` row from
  Dexie, and the session token from wherever `supabase-js` persists it
  (`localStorage`). No network call is made as part of the guard itself.
- If both are present → render `<AppShell/>`/children normally, with the member's
  name/avatar available (e.g. via a small context or a TanStack Query hook seeded from
  the Dexie read) for `AppShell` to display.
- If absent (never signed in, or previously signed out) → `<Navigate to="/" replace />`.
- Sign-out (new UI surface, likely in `AppShell` or Settings) clears the cached
  `members` row from Dexie and calls `supabase.auth.signOut()` (which clears the
  persisted token), then redirects to `/`.

## Definition of Done

- [x] `supabase/` directory exists in the repo (`supabase init`), linked to the
      remote project (`supabase link --project-ref gmmeaplomgotqtivevkg`)
- [x] `members` table exists in Supabase, created via a checked-in migration
      (`supabase/migrations/20260820001601_create_members.sql`, applied with
      `supabase db push`) with the exact columns above, including `pin` (nullable,
      unused), `last_modified_at`, `deleted_at` — **confirmed live** via a direct
      query against the project
- [x] RLS enabled on `members` with zero policies (deny-all default) via
      `supabase/migrations/20260820002936_enable_members_rls.sql` — added
      proactively once the table was live, since Supabase exposes every table over
      PostgREST to the public anon key by default. Full policy design is still a
      separate follow-up task; this is the minimal safe default in the meantime.
- [ ] Google Cloud Console project has a configured OAuth consent screen and a Web
      OAuth client with correct authorized origins/redirect URIs
- [x] Supabase's Google provider is enabled with the Google client ID/secret plugged
      in — **confirmed live** via the project's public `/auth/v1/settings` endpoint
      (`external.google: true`)
- [ ] Site URL / Redirect URLs are configured for both `localhost:5173` and the
      production origin (not verifiable from outside the dashboard — confirm manually)
- [x] `mint-member-session` Edge Function written
      (`supabase/functions/mint-member-session/index.ts`)
- [ ] `mint-member-session` deployed (`supabase functions deploy`) and its JWT
      secret set as a function secret (`supabase secrets set APP_JWT_SECRET=...`)
      — **blocked on the founder**, who is setting this directly rather than passing
      the secret through this chat session
- [x] Client-side wiring written: `GoogleSignInButton` calls real
      `signInWithOAuth`, `AuthCallbackPage` exchanges the OAuth session for the
      custom JWT via the Edge Function, `AuthGuard` protects `/app/*`,
      `AppShell` shows the member's avatar/name and a sign-out control
- [ ] Clicking "Sign in with Google" in `GoogleSignInButton` redirects through
      Google's real consent screen and lands back on `/app/bill` with the signed-in
      member's name and avatar visible in `AppShell` — **blocked on Edge Function
      deploy above**, not yet tested end-to-end
- [ ] A `members` row is created in Supabase on first sign-in with correctly
      populated `google_id`/`google_email`/`email_verified`/`first_name`/`last_name`/
      `avatar_url`/`locale`; signing in again with the same Google account updates
      (not duplicates) that row, even if the account's email has changed
- [ ] The client is using the custom TallyThreads JWT (`sub = members.id`) for
      subsequent Supabase calls, not the raw Supabase OAuth session — verifiable by
      decoding the token client-side in a dev check and confirming `sub` matches the
      `members.id`, not any `auth.users` id
- [x] Navigating directly to `/app/bill` (or any `/app/*` route) while signed out
      redirects to `/` — **verified** with Playwright against the dev server
- [ ] Navigating to `/app/bill` while signed in (cached session present) works fully
      offline — verified by signing in once, then reloading the app with dev-tools
      network throttling set to "Offline"
- [ ] Navigating to `/app/bill` while offline and never having signed in redirects
      to `/`, and `/` itself still renders correctly offline
- [ ] Signing out clears the cached member row from Dexie and the persisted token
      from `localStorage`, and redirects to `/`; a subsequent offline reload of
      `/app/bill` then redirects to `/` (proves sign-out actually cleared local
      state, not just in-memory)
- [x] `pnpm build`, `pnpm typecheck`, `pnpm test` all green
- [x] No secret values (Google client secret, Supabase JWT secret, service-role key)
      committed anywhere in the repo

## Changed / new files

| File | Change |
|---|---|
| `src/db/index.ts` | Bumped Dexie schema to `version(2)`, added `Member` interface + `members` table |
| `src/lib/supabaseClient.ts` | Added the `accessToken` client option, reading the custom JWT via `getMemberJwt()` — **not** `auth.setSession()`, since the custom JWT has no matching Supabase-issued refresh token (see v1.5.0 changelog entry) |
| `src/lib/memberSession.ts` (new) | `localStorage` get/set/clear helpers for the custom JWT — deliberately outside Dexie |
| `src/lib/supabaseEnv.ts` (new) | Shared env-var validation, used by both Supabase clients |
| `src/lib/supabaseAuthClient.ts` (new) | Plain Supabase client used only for the Google OAuth handshake — see v1.7.0 changelog entry for why this had to be separate from the main client |
| `src/features/home/components/GoogleSignInButton.tsx` | Replaced `console.info` stub with a real `signInWithOAuth` call + pending state |
| `src/router.tsx` | Added `/auth/callback` route; wrapped `/app/*` in `AuthGuard` |
| `src/components/AppShell.tsx` | Added member avatar/name display and a sign-out control |
| `src/features/auth/useMember.ts` (new) | Offline-capable hook reading the cached member from Dexie |
| `src/features/auth/signIn.ts` (new) | Triggers `supabase.auth.signInWithOAuth({ provider: "google" })` |
| `src/features/auth/signOut.ts` (new) | Clears the cached Dexie row + stored JWT |
| `src/features/auth/AuthCallbackPage.tsx` (new) | Lands after the Google redirect; calls the Edge Function, caches the result, discards the disposable OAuth session |
| `src/features/auth/AuthGuard.tsx` (new) | Route guard wrapping `/app/*`, offline-capable (Dexie read only) |
| `supabase/config.toml` (new, via `supabase init`) | Supabase CLI project config, links this repo to the remote project |
| `supabase/functions/mint-member-session/index.ts` (new) | The Edge Function — written, not yet deployed |
| `supabase/migrations/20260820001601_create_members.sql` (new) | The `members` table migration — applied to the live project |
| `supabase/migrations/20260820002936_enable_members_rls.sql` (new) | Deny-all RLS default on `members`, applied proactively — applied to the live project |

## Changelog

- **v1.12.0** — The v1.11.0 fix was actually correct, but the founder still saw the
  error screen on retry — turned out to be a *different* bug, not the constraint.
  React 18 StrictMode double-invokes effects in dev, so `AuthCallbackPage` was firing
  **two concurrent sign-in attempts** on a single page load. In this test, one
  attempt hit a transient `PGRST303: JWT issued at future` (likely clock skew,
  upstream) and called `setError`; the other attempt actually succeeded (member
  cached, `data`/`fnError` both clean) — but the previous `let cancelled` pattern
  only prevented the *cancelled* run's `navigate()`/`setError` calls, not the
  still-active run's, and whichever run's state update landed last won the visible
  UI — in this case, the failing one. Also: the "member cached, navigating"
  log line was printed unconditionally even when `cancelled` suppressed the actual
  `navigate()` call, which made this race harder to read from the logs than it
  should have been.

  Fixed with a `useRef` "has this effect body already run" guard, which fully skips
  the second StrictMode invocation rather than letting both run and race — this is
  the standard fix for this exact class of dev-mode double-effect bug, and it also
  means only one `mint-member-session` call happens per page load instead of two.
  `PGRST303` itself hasn't recurred since; if it does, it's likely worth a
  server-side retry rather than surfacing it as a user-facing failure, but not
  chasing that further until it's seen again.
- **v1.11.0** — Real root cause found via the v1.10.0 error-surfacing work: Postgres
  `42P10`, "there is no unique or exclusion constraint matching the ON CONFLICT
  specification". The original `members_google_id_idx` (v1.5.0) was a **partial**
  unique index (`... WHERE deleted_at IS NULL`), which can't serve as an
  `ON CONFLICT (google_id)` arbiter for a plain `.upsert()` call — Postgres only
  matches a conflict target against an unconditional unique constraint (or a partial
  index whose predicate the conflict clause repeats exactly, which `supabase-js`'s
  generated upsert doesn't do). Fixed via
  `supabase/migrations/20260820020529_fix_members_google_id_constraint.sql`: dropped
  the partial index, added a real `unique` constraint on `google_id`. Trade-off
  accepted: `google_id` is now unique across *all* rows including soft-deleted ones —
  fine for now since no delete flow exists yet, documented in the migration itself as
  something to revisit if one gets built. This was NOT a service-role/RLS issue as
  suspected in v1.10.0 — the admin client reached the table fine; the constraint
  itself was just structurally wrong for how `.upsert()` needs it.
- **v1.10.0** — CORS is now genuinely fixed: the founder's real browser test reached
  the function, which returned a real `500`. No log tooling was available
  (`supabase functions logs` doesn't exist on the installed CLI version), so instead
  the function was hardened to always fail loudly: the whole handler wrapped in
  try/catch, the `members` upsert error's actual Postgres message/code/hint returned
  in the JSON body instead of a generic "Failed to persist member", and an env-var
  presence check added. Also fixed the client silently hiding the real cause:
  `FunctionsHttpError`'s `.message` is just "non-2xx status code" — the actual reason
  is in the response body (`error.context`, a `Response` object), which
  `AuthCallbackPage` wasn't reading. It now clones and logs that body. Prime
  suspect for the 500, not yet confirmed: `members` has RLS enabled with zero
  policies (v1.5.0) — if the service-role key isn't reaching the function as
  expected, the admin client's upsert would be blocked by that same deny-all
  default. This deploy should surface the real Postgres error on the next attempt.
- **v1.9.0** — A real browser test against the redeployed function surfaced two more
  issues:
  1. **CORS still failing**, now on the request header allowlist specifically:
     `supabase-js`'s `functions.invoke()` automatically adds an `X-Client-Info`
     header (client version identifier), which v1.8.0's `Access-Control-Allow-Headers`
     didn't include, so preflight failed again with a more specific browser error.
     Added `x-client-info` and `x-supabase-api-version` to the allowlist; confirmed
     with a manual `OPTIONS` request matching the browser's actual
     `Access-Control-Request-Headers` that the response now allows all of them.
  2. **`signOut()` still 403'd even with `scope: "local"`** — the v1.8.0 fix didn't
     actually address the cause (root cause not yet identified). Since discarding
     this disposable OAuth session is a cleanup step, not something anything else in
     the app depends on, made it non-blocking: wrapped in try/catch, logged, and no
     longer able to interfere with the real sign-in outcome either way.
  Also added `console.log` tracing through every step of `AuthCallbackPage` (session
  fetch, function invoke, sign-out, member cache, navigation) at the founder's
  request, to make the next round of debugging faster from browser console output
  alone.
- **v1.8.0** — Fixed the redirect_uri_mismatch (Google Console side, no code change —
  founder added the callback URL). Then, with the OAuth redirect completing
  successfully and landing on `/auth/callback`, two more bugs surfaced from a real
  browser test with real console output:
  1. **CORS blocked the `mint-member-session` call entirely** (preflight failed, no
     `Access-Control-Allow-Origin` header). Edge Functions don't add CORS headers on
     their own — the function has to handle `OPTIONS` and set them itself. Fixed and
     redeployed; confirmed with a manual `OPTIONS` request that preflight now
     succeeds (`Access-Control-Allow-Origin: *`). Narrowing that from `*` to the
     real app origin(s) before going to real users is still worth doing later.
  2. **`supabaseAuthClient.auth.signOut()` returned 403.** Was using the default
     `scope: "global"` (revokes every session for that identity everywhere) where
     `scope: "local"` (end only this one disposable OAuth session) is what was
     actually needed and doesn't hit the same restriction.
- **v1.7.0** — Fixed "Sign in with Google" doing nothing on click, no network request
  fired. Root cause: `supabase-js` explicitly disables `auth.*` methods (including
  `signInWithOAuth`) on any client configured with the custom `accessToken` option —
  `src/lib/supabaseClient.ts` had that option set globally, so calling
  `signInWithOAuth` on it threw immediately (silently, since the original
  `GoogleSignInButton` swallowed the error without logging it — also fixed, it now
  `console.error`s). Split into two client instances: `supabaseAuthClient.ts` (plain,
  used only for the OAuth handshake — `signInWithGoogle`, `AuthCallbackPage`'s
  `getSession`/`functions.invoke`/`signOut`) and `supabaseClient.ts` (the
  `accessToken`-configured client, used for everything else once a member is signed
  in). Shared env-var validation extracted to `src/lib/supabaseEnv.ts` to avoid
  duplicating it across both clients.

  Confirmed fixed: clicking the button now genuinely calls
  `/auth/v1/authorize` and redirects to Google. That surfaced a **second, separate,
  expected issue**: Google rejects the redirect with `redirect_uri_mismatch` —
  `https://gmmeaplomgotqtivevkg.supabase.co/auth/v1/callback` isn't yet registered
  as an authorized redirect URI in Google Cloud Console. This is the manual
  Google Console step from this spec's setup section that couldn't be verified
  externally — **still needs to be done** before a real sign-in can complete.

- **v1.6.0** — Renamed the JWT secret from `SUPABASE_JWT_SECRET` to `APP_JWT_SECRET`
  everywhere (Edge Function code and this doc). The `SUPABASE_` prefix is reserved
  for the platform's own auto-injected vars — `supabase secrets set` refuses to
  accept any custom secret name starting with it, discovered when the founder tried
  to set it and the CLI rejected the command.
- **v1.5.0** — First implementation pass. `supabase/` scaffolded and linked to the
  live `tallythreads` project; `members` table migration written and applied
  (`supabase db push`); a second migration enabling RLS with zero policies applied
  immediately after, as a proactive deny-all default — the table was briefly readable
  by anyone with the anon key between the two migrations, since Supabase exposes new
  tables over PostgREST by default and this hadn't been locked down yet. Edge
  Function (`mint-member-session`) written using `Deno.serve` + `supabase-js` +
  `jose` directly, not the newer CLI-scaffolded `withSupabase` helper (undocumented
  enough at the installed CLI version to trust for something security-sensitive).
  Client-side: `useMember`/`signIn`/`signOut`/`AuthCallbackPage`/`AuthGuard` written;
  `GoogleSignInButton` and `AppShell` wired up. Confirmed live that the migration
  actually created the table (direct anon-key query, `count: 0`, no error) and that
  RLS is genuinely blocking it afterward — the latter only half-verified, since a
  `count: 0` result is consistent with "empty table" as well as "RLS denies all," and
  proving it conclusively needs a service-role insert this session didn't have
  credentials for.

  **Blocked, not yet done:** the Edge Function is written but not deployed — it
  needs `APP_JWT_SECRET` set as a function secret first, which the founder is
  setting directly rather than passing through chat. Until that's deployed, no
  end-to-end Google sign-in has actually been tested — only the route guard's
  signed-out redirect has been verified (Playwright, dev server).

  **Design decision made during implementation:** the client does **not** use
  `supabase.auth.setSession()` to install the custom JWT, as originally implied —
  that API expects a Supabase-issued session with a matching refresh token, which
  the custom JWT doesn't have. Instead, `supabaseClient.ts` uses supabase-js's
  `accessToken` client option (a documented mechanism for exactly this
  "bring-your-own-JWT" case), reading the token from `src/lib/memberSession.ts`
  (`localStorage`) on every request.

- **v1.3.0** — Added a "Repo-managed Supabase folder" section: migrations and Edge
  Functions are managed via the Supabase CLI in a checked-in `supabase/` directory
  (`supabase init`/`link`/`migration new`/`db push`/`functions new`/`functions
  deploy`), not applied by hand through the dashboard. Confirmed live that Supabase's
  Google provider is genuinely enabled on the project (`/auth/v1/settings` →
  `external.google: true`) and checked that off in the Definition of Done; flagged
  that Site URL/Redirect URLs and the Google Console side still need manual
  confirmation (not verifiable from outside the dashboard).
- **v1.2.0** — Clarified that Dexie holds the member *profile* only, never the JWT.
  The session token is kept in `localStorage` via `supabase-js`'s own default
  session persistence instead — Dexie is reserved for data records that mirror
  Supabase tables and flow through the `_dirty`/outbox sync pattern, which a bearer
  credential isn't. Resolved open question #3 (JWT storage location) accordingly.
- **v1.1.0** — Broadened the Google profile data captured: added `google_id` (Google's
  stable `sub` claim, now the real dedup key instead of the mutable `google_email`),
  `email_verified`, and `locale`. Documented exactly which fields Google Sign-In does
  and doesn't provide — there's no general-purpose "Google notification channel"
  available from this integration, only the standard OpenID Connect profile claims.
- **v1.0.0** — Initial draft spec, written for founder review. No implementation yet.

## Open questions — resolve before implementation begins

1. **`members.id` generation:** server-generated UUID (as designed above) vs.
   client-generated like `_localId`/the optimistic pattern used elsewhere.
   Server-generated is simpler here since sign-in inherently requires a round trip
   anyway (no optimistic-UI benefit to gain), but flagging since it deviates from the
   `_localId` pattern used for `Product`/`Invoice`.
2. **JWT expiry/refresh strategy:** how long does the custom JWT live, and what's the
   refresh flow when it expires while the user is online vs. what happens if it's
   expired and the user is offline (the guard doesn't network-validate offline — but
   what happens on the *next* online session if the cached JWT has since expired)?
3. ~~Where exactly the JWT is persisted client-side~~ — **resolved:** `localStorage`,
   via `supabase-js`'s own default session storage (`supabase.auth.setSession`).
   Explicitly not Dexie — Dexie is for data records that mirror Supabase tables and
   flow through the sync/outbox pattern; a bearer token isn't a data record.
4. **What happens if a user revokes Google access** (via their Google account
   settings) after having signed in — does the app detect this gracefully on next
   network-connected launch, or does it just fail opaquely?
5. **Google OAuth consent screen publish status** — stays in "Testing" (capped
   test-user list) vs. going through Google's verification process for "In
   production" status. Testing mode is fine for a solo developer during build-out but
   blocks real customers from signing in until verified.
6. **"Logout everywhere" / session revocation** — is there a requirement to
   invalidate a member's custom JWT server-side (e.g. if a device is lost), or is
   sign-out purely a client-side local clear for now?
7. **Rate-limiting / abuse protection on the Edge Function** — `mint-member-session`
   mints a valid app token on every call; should it be rate-limited or otherwise
   hardened beyond Supabase's default Edge Function protections?
8. **Where RLS policies referencing `members`/`auth.uid()` land** — this task
   deliberately excludes RLS, but the Edge Function's JWT design assumes RLS
   elsewhere will eventually key off `auth.uid() = members.id` — worth confirming
   that's still the intended follow-up shape before it's built.

## Notes

- This inserts after M0.6 (Supabase connection) and before the email-OTP follow-up in
  the `M1-auth-*` series. Full RLS policy work and the phone-OTP line item from the
  constitution's M1 roadmap row are handled by other, still-to-be-created tasks.
