# M1a — Identity & Auth

**Status:** Planned
**Version:** 1.5.0
**Est:** 26.5 hrs (Constitution §5 — part of M1's 102h total, phase M1a of `M1-task-plan.md`; grew from 22h with Task 3's addition, see Changelog)
**Tracking:** [Issue #28](https://github.com/storenode/storeparda-web/issues/28) · Project board: not yet added (see Notes — `gh` lacks the `project` OAuth scope needed to add it automatically)

## What this is

The first of M1's five sub-phases (M1a–M1e). It builds TallyThreads's member identity
and login: a store user signs in with Google once per device, then on that same
device can log back in with a short PIN instead of repeating the Google OAuth flow
every time. Two deliverables:

1. **Google Sign-in + custom JWT** — a member authenticates with Google, a
   `members` row is created/updated keyed on their Google identity, and the app mints
   its own TallyThreads JWT (not Supabase's raw OAuth session) for all subsequent use.
   The signed-in session is cached in the local Dexie database so `/app/*` keeps
   working offline after the first successful sign-in.
2. **PIN + device enrollment** — after a member's Google sign-in on a given device,
   that device is "enrolled" and the member is prompted to set a PIN **for that
   device**. From then on, the member can log back in on that same device with a
   4-to-6-digit PIN instead of Google, without needing network access to Google at
   all. PINs expire after 30 days and lock out after repeated wrong attempts. A
   device that has never completed a Google sign-in cannot be used for PIN login,
   even with the correct PIN — the PIN is a per-device credential, not a
   member-wide one. **This means the PIN itself is scoped to the device, not the
   member: signing in with Google on a second, new device does not carry over the
   PIN from the first device — the member must set a new PIN on each newly
   enrolled device.**

   Enrollment is keyed on **(`device_id`, `member_id`)**, not `device_id` alone —
   see the shared-device note below.

### Shared devices (store counter laptop/tablet used by multiple staff)

`device_id` is a UUID generated once per browser and persisted in `localStorage`
(Task 2, subtask 2) — it identifies the *physical device/browser*, not a person. A
real cloth-store counter commonly has one shared laptop or tablet that multiple staff
members sign into over time. Without a fix, two staff members on that one browser
would collide on a single `device_id` and effectively share one enrollment/PIN.

**Fix:** the `devices` table's uniqueness constraint (and every enrollment/PIN lookup)
is on the **composite (`device_id`, `member_id`)** pair, not `device_id` alone. Each
staff member who signs in with Google on that shared laptop gets their own `devices`
row — their own enrollment, their own PIN, their own lockout state — even though they
all share the same `device_id`. `verify-pin`'s `{ email, pin, device_id }` payload
already carries enough information to look up the right composite row (email resolves
to `member_id`), so no client-side change is needed there beyond what's already
speced — just the schema/lookup correction.

**Dexie must mirror this composite key, not just the server.** `M1-auth-google.md`
built Dexie to cache a single `members` row per browser — fine for one person per
device, wrong for a shared counter laptop. M1a's Dexie schema instead keys cached
sessions/PIN state by **`(device_id, member_id)`**, so multiple members' sessions can
be cached locally on the same browser at once, each independently valid and offline-
capable, rather than one member's cached session overwriting another's. Concretely:
- The Dexie `members`/session table's primary key becomes (or is indexed by)
  `member_id`, not a singleton — more than one member row can be cached at a time.
- The client tracks which cached member is "active" (the one `/app/*` currently
  renders as) separately from which members are merely cached/enrolled on this device.
- Switching from staff member A to staff member B on the same browser — either via B's
  own PIN or a fresh Google sign-in — sets B as the active cached member without
  deleting A's cached row; A's session, PIN, and enrollment remain intact and A can
  switch back later (offline, if A's session hasn't expired) without redoing Google
  sign-in.
- The PIN entry screen asks which account (email, or a picker built from the members
  already cached locally on this device) is signing in, alongside the PIN — `device_id`
  alone no longer disambiguates who's enrolled on a shared browser.

This file is the phase-level task spec (subtasks, hours, acceptance criteria) for
M1a. It depends on `specs/docs/M1-schema-reference.md` (v1.1.0) for exact column
definitions and `constitution.md` v1.3.0 for the offline-capability requirement
(§2.I) that shapes the Dexie caching work. `specs/docs/` is the living schema/design
source — this task file is a point-in-time implementation plan built against it and,
per project convention, does not get revised after implementation starts; further
schema evolution happens in `specs/docs/` and is picked up by a later task, not by
editing this file post-hoc.

**⚠️ Known, accepted divergence from `M1-auth-google.md`:** that spec (In Progress,
v1.12.0; base Google sign-in already implemented, see commit `d0fecff`) reserves a
single `pin` column on `members` for a future **email one-time-code** login — unrelated
to and not reconciled with the device-gated PIN design here. That column is simply
unused/dead once Task 1 below runs; no migration cleans it up as part of M1a. If the
email-OTP idea is revived later, it needs its own column, not the reserved one (which
by then will read as "PIN" and be actively used for a different purpose). Not fixing
`M1-auth-google.md` itself — it's already partially implemented — this note exists so
the divergence is visible rather than silently forgotten.

## Scope

**In scope for this task:**
- `members` table migration with the full column set from `M1-schema-reference.md`
  §1, including `platform_role` (no `pin_*` columns here — those live on `devices`)
- `mint-member-session` Edge Function (Google claims → upsert `members` → mint JWT)
- Google Cloud Console OAuth consent screen + Web OAuth client credentials
- Supabase dashboard Google provider + Site URL / Redirect URL config
- Client: `GoogleSignInButton`, OAuth-callback route, Dexie session caching keyed on
  `member_id` (multi-member cache, not a singleton — see the Dexie note above),
  offline route guard (`requireMember` / `<AuthGuard>`), sign-out
- `devices` table migration: server-generated `id` surrogate key, client-generated
  `device_id`, unique on the composite (`device_id`, `member_id`) — see the
  shared-devices note above
- Device ID generation and enrollment on first Google sign-in per device
- `set-pin` and `verify-pin` Edge Functions
- Client PIN creation prompt (shown on every newly enrolled device) and PIN entry
  screen (repeat logins)
- 30-day PIN expiry and failed-attempt lockout handling
- `devices.last_seen_at` / `last_login_location` columns, populated on every
  successful `mint-member-session`/`verify-pin` call — the data only; the
  admin-portal UI to view it is backlog (§10 of `constitution.md`)
- The "no store assigned" interstitial page shown when a member's Google identity
  resolves to a `members` row with no associated store (see note below)

**Explicitly deferred, NOT built in this task:**
- Store invitations / staff onboarding, `access_grants`, `memberships` — Phase M1b
- Anything franchise-specific — Phase M1c/M1d
- RLS policies referencing `members`/`devices` — Phase M1e (this phase only builds
  the tables and Edge Functions; access-control policies around them are a separate,
  later pass)
- Device revocation (lost/stolen phone) and any admin-portal UI — tracked as backlog
  in `constitution.md` §10, not scheduled to a phase yet
- Rate limiting on `verify-pin` beyond the per-device lockout in Task 2 — the
  `last_seen_at`/`last_login_location` columns above are the deliberate lighter-weight
  alternative for now; real rate limiting can be added later without a schema change

## Task 1 — Google Sign-in + custom JWT (12h)

**Delivers:** `members` table, `mint-member-session` Edge Function, Google Cloud
Console + Supabase provider config, client-side token swap, offline session caching
in Dexie.

| # | Subtask | Hours |
|---|---|---|
| 1 | Google Cloud Console: OAuth consent screen (scopes `email`/`profile`/`openid`) + Web OAuth client credentials | 1.0 |
| 2 | Supabase dashboard: enable Google provider, configure Site URL / Redirect URLs | 0.5 |
| 3 | `members` table migration — full column set from `M1-schema-reference.md` §1, including `platform_role` (`pin_*` columns are not on `members` — see `devices` in Task 2) | 1.0 |
| 4 | `mint-member-session` Edge Function: read the caller's Supabase OAuth session, extract Google identity claims (`sub`, `email`, `email_verified`, `given_name`, `family_name`, `picture`, `locale`), upsert `members` keyed on `google_id`, mint a custom JWT with `sub = members.id` and a **30-day expiry**, matching the 30-day PIN validity window Task 2 uses per device, so a member's session and any given device's PIN lapse on the same cadence | 3.0 |
| 5 | Client: `GoogleSignInButton` wired to `signInWithOAuth`; OAuth-callback landing route that calls `mint-member-session` and performs the `setSession` token swap | 2.0 |
| 6 | Client: write the returned member profile to the local Dexie member-session table, keyed on `member_id` (not a singleton — see the Dexie multi-member note above), and mark it the active member; read the active member back on app load for the offline-capable session check | 1.5 |
| 7 | Route guard (`requireMember` loader / `<AuthGuard>`) around `/app/*` — offline-capable, reads only the cached Dexie row, no network call | 1.0 |
| 8 | Sign-out: clear the *active* member's cached row and JWT from Dexie (leaving any other members still cached on this shared device untouched), redirect to `/` | 0.5 |
| 9 | Testing: full online sign-in flow end-to-end; offline reload test (DevTools network throttling → Offline, confirm `/app/*` still renders from cache); sign-out actually clears state (verified by an offline reload after sign-out redirecting to `/`) | 1.5 |

### Definition of Done — Task 1
- [ ] Clicking "Sign in with Google" redirects through Google's real consent screen and
      lands on `/app/*` with the signed-in member's name/avatar visible
- [ ] A `members` row is created on first sign-in with correct `google_id` (dedup key,
      not email) and updates — not duplicates — on repeat sign-in
- [ ] The client uses the custom TallyThreads JWT (`sub = members.id`) for subsequent
      calls, verifiable by decoding the token and confirming it's not the raw Supabase
      OAuth session
- [ ] `/app/*` while signed out redirects to `/`; while signed in, works fully offline
      (constitution §2.I) — verified with network throttling set to Offline after one
      prior successful sign-in
- [ ] Sign-out clears Dexie state — a subsequent offline reload of `/app/*` redirects to `/`
- [ ] The custom JWT expires 30 days after mint — decode the token and confirm its
      `exp` claim, don't just eyeball the Edge Function code
- [ ] A member whose Google sign-in resolves to a `members` row with no associated
      store lands on a "no store assigned" page, not a crash or a silent redirect loop
- [ ] No secret values (Google client secret, Supabase JWT secret) committed anywhere

## Task 2 — PIN + device enrollment (10h)

**Depends on Task 1** (the `devices`/PIN columns reference `members`, and device
enrollment only happens as a follow-on to a completed Google sign-in).

**Delivers:** `devices` table (server-generated `id` + client-generated `device_id`,
unique on `(device_id, member_id)`) with per-device-per-member PIN hash/lockout
columns, `enroll-device` + `verify-pin` Edge Functions, client PIN entry UI, 30-day
expiry handling, and the new-device-forces-new-PIN flow.

| # | Subtask | Hours |
|---|---|---|
| 1 | `devices` table migration (columns per `M1-schema-reference.md` §1 v1.1.0): server-generated `id` PK, client-generated `device_id`, **unique on the composite (`device_id`, `member_id`)** — not `device_id` alone, see the shared-devices note above. Includes `last_seen_at` and `last_login_location` columns for future admin-portal visibility (`constitution.md` §10) | 0.5 |
| 2 | Client: device ID generation on first app load (UUID persisted in `localStorage`) — identifies the browser/device only, not the person; a shared device can carry multiple members' enrollments against the same `device_id` | 0.5 |
| 3 | Device enrollment: extend `mint-member-session`'s response path (or a follow-up call) to upsert a `devices` row on first successful Google sign-in from that `(device_id, member_id)` pair, and stamp `last_seen_at`/`last_login_location` | 1.0 |
| 4 | `set-pin` Edge Function: authenticated via the just-completed session; hashes and stores a new PIN on the caller's `(device_id, member_id)` row (`pin_hash`, `pin_created_at`, `pin_expires_at` = now + 30 days), reset `pin_failed_attempts` | 1.5 |
| 5 | `verify-pin` Edge Function: `{ email, pin, device_id }` → resolve `email` to `member_id`, look up the `(device_id, member_id)` row, confirm it's enrolled and not revoked, confirm PIN hash matches and isn't expired or locked, increment `pin_failed_attempts` on mismatch, lock via `pin_locked_until` after 5 failed attempts **until the member completes Google sign-in again on that device** (no auto-expiring cooldown — the 6th attempt onward returns a "too many failed attempts — sign in with Google to reset your PIN" message instead of checking the PIN at all), reset the counter on success, stamp `last_seen_at`/`last_login_location`, mint the same-shaped JWT as `mint-member-session` on success | 2.5 |
| 6 | Client: "Create a PIN" prompt shown after **every** newly enrolled device's Google sign-in (not just the member's first device ever) — a member signing in on a second/third/etc. device is prompted to set a new PIN for that device, since PIN is per-device, not carried over from prior devices | 1.0 |
| 7 | Client: PIN entry screen for repeat logins — asks for email (or shows a picker of members previously enrolled on this `device_id`, if the client tracks that locally) plus PIN, calling `verify-pin` with `{ email, pin, device_id }`; surfaces the "too many failed attempts — sign in with Google" message verbatim from `verify-pin` on lockout | 1.0 |
| 8 | Testing: enroll → set PIN → PIN login succeeds on the same device; PIN login attempted from a second, unenrolled device fails with a clear "sign in with Google first on this device" message even with the correct PIN; **Google sign-in on that second device (enrolling it) prompts for a new PIN, and the first device's PIN does not work there**; **two different members enrolling on the same shared `device_id` (e.g. a store counter laptop) each get their own independent PIN and lockout state**; lockout triggers after 5 failed attempts on one `(device_id, member_id)` pair and shows the "sign in with Google" message, without locking the member's other enrolled devices or other members enrolled on the same shared device; an expired PIN falls back to prompting Google sign-in rather than erroring opaquely | 2.0 |

### Definition of Done — Task 2
- [ ] A device with no prior Google sign-in cannot complete PIN login, even with a
      correct email + PIN combination
- [ ] A member's PIN is scoped to one device: after Google sign-in on a **new**
      device, the member is prompted to set a new PIN for that device even though
      they already have a PIN set on a different, previously enrolled device — the
      old device's PIN does not work on the new device and vice versa
- [ ] PIN is stored only as a hash (`pin_hash`, on `devices`, not `members`) — never
      in plaintext, never logged
- [ ] `devices` is unique on the composite (`device_id`, `member_id`): two members
      enrolling on the same physical device/browser get independent PIN and lockout
      state, and switching who's signed in on a shared device doesn't disturb the
      other member's enrollment
- [ ] After 5 failed PIN attempts on a given `(device_id, member_id)`, that pair is
      locked and the client shows "Too many failed attempts. Please sign in with
      Google to reset your PIN." — the lock does not auto-expire on a timer; it only
      clears when the member completes Google sign-in again on that device
- [ ] A PIN past its 30-day `pin_expires_at` cannot be used to sign in; the client
      surfaces this as "your PIN has expired — sign in with Google" rather than a
      generic error
- [ ] `verify-pin` returns the same JWT shape as `mint-member-session`, so downstream
      code (route guard, API calls) doesn't need to know which credential path was used
- [ ] Every successful `mint-member-session`/`verify-pin` call stamps
      `last_seen_at`/`last_login_location` on the relevant `devices` row

## Task 3 — Sign In / Sign Up split, unified login page, Remember Me (4.5h)

**Depends on Task 1 and Task 2** (the login page composes the PIN form from Task 2
and the Google button from Task 1; nothing here changes the server-side auth design,
it's UI/UX built on top of it).

Added after Task 1/Task 2 were already speced — a founder ask for a more standard
product pattern than "one Google button doubles as both sign-in and sign-up." Kept as
its own task, rather than edited into Task 1/Task 2's already-written subtasks, so the
original Google/PIN engineering plan stays intact and this addition is clearly
visible as later-arriving scope (see Changelog).

**Delivers:** a marketing-page "Sign In" button (shared `Button` component styling,
not a second Google pill) that routes to a new unified `/login` page offering both
PIN entry and Google; the existing Google button relabeled "Sign up with Google"
everywhere it's the primary CTA; a Remember Me checkbox on the PIN form that persists
the last-used email on this device.

| # | Subtask | Hours |
|---|---|---|
| 1 | Restyle the marketing "Sign In" entry point onto the shared `Button` component (`src/components/ui/Button.tsx` — e.g. `ghost` or `secondary` variant) instead of a second Google-styled pill; relabel the existing `GoogleSignInButton` to "Sign up with Google" everywhere it's used as the primary CTA (`Navbar`, `Hero`, `CTASection`) | 0.5 |
| 2 | New unified `/login` route/page: email+PIN form (reusing `PinLoginPage`'s existing form/validation) plus a divider and a "Sign in with Google" option (`GoogleSignInButton`, reused) for a returning user who'd rather not use PIN. Retires the standalone `/auth/pin` route in favor of this one | 1.5 |
| 3 | Remember Me: a checkbox on the PIN form that persists the last-used email to `localStorage` (new small module, following the pattern of `src/lib/deviceId.ts`) and prefills it on load; unchecking clears the stored value. No server/schema involvement — purely client-side, independent of the existing fixed 30-day JWT/PIN expiry | 1.0 |
| 4 | Update `Navbar`/`Hero`/`CTASection` to the new Sign In → `/login` and Sign Up → Google wiring and copy | 0.5 |
| 5 | Testing: Sign Up (new user) via Google is unchanged end-to-end (still lands on `/auth/set-pin` → `/no-store`); Sign In lands on `/login` showing both PIN and Google; Remember Me persists/clears the email correctly across reloads and across sign-out (folds into the Manual Test Plan below as group I) | 1.0 |

### Definition of Done — Task 3
- [ ] Home page shows a "Sign In" button (shared `Button` styling) and a separate
      "Sign up with Google" button — visually distinct, not two Google pills
- [ ] Clicking "Sign In" lands on `/login`, which offers both PIN entry and a Google
      option
- [ ] Checking "Remember me" on the PIN form persists the email for next time on this
      device; unchecking it clears any previously remembered email
- [ ] Sign-up-via-Google still ends up on `/auth/set-pin` → `/no-store`, unchanged
      from Task 1/Task 2's existing flow

## Sequencing within M1a

Task 1 must be functionally complete (a member can sign in with Google and reach
`/app/*`) before Task 2 starts — device enrollment has nothing to enroll against
until a Google sign-in exists. Within Task 1, subtasks 1–3 (console/dashboard/schema
setup) can happen in any order but must precede subtask 4 (the Edge Function needs
the schema and provider config to exist). Task 3 starts only once Task 1 and Task 2
are both functionally complete — it's UI built on top of both, not a schema/Edge
Function change.

## Definition of Done

- [ ] Task 1 Definition of Done (above), fully satisfied
- [ ] Task 2 Definition of Done (above), fully satisfied
- [ ] Task 3 Definition of Done (above), fully satisfied
- [ ] Multiple members can enroll/PIN-login on the same shared `device_id` (browser)
      independently, and Dexie caches more than one member's session at a time on
      that device without one overwriting another
- [ ] Device revocation and admin-portal login tracking are intentionally *not* built
      here — confirm `constitution.md` §10 backlog entries exist and are up to date

## Manual Test Plan

To be run by hand before/alongside the automated test suite, once Task 1 and Task 2
are both implemented. Grouped to match the DoD sections above.

**A. Google sign-in (Task 1)**

1. Fresh browser, click "Sign in with Google" → real Google consent screen appears →
   after approving, lands on `/app/*` with correct name/avatar shown.
2. Check the `members` table: exactly one row created, `google_id` populated (not
   `google_email` used as the dedup key).
3. Sign out, sign in again with the same Google account → same `members` row is
   updated (name/avatar refreshed if changed on Google's side), no duplicate row.
4. Decode the JWT the app is using for API calls → `sub` = the `members.id` (not
   Supabase's internal `auth.users` id), and `exp` is ~30 days out from mint time.
5. Sign in, then reload with DevTools Network set to Offline → `/app/*` still renders
   from the cached Dexie session (no network call needed).
6. While signed out, navigate directly to `/app/*` → redirected to `/`.
7. Sign out → confirm the active member's cached row and JWT are cleared from Dexie →
   reload `/app/*` **offline** → still redirects to `/` (proves state was actually
   cleared, not just the UI).
8. Search the repo/commit history for the Google client secret and Supabase JWT
   secret → confirm neither is committed anywhere.
9. Sign in with a Google account that has no store linkage (every account, until
   M1b ships memberships) → lands on the "no store assigned" interstitial, not a
   crash or a redirect loop.

**B. First device enrollment + PIN creation (Task 2)**

10. Immediately after a device's first successful Google sign-in, the "Create a PIN"
    prompt appears automatically (not something you have to navigate to).
11. Set a PIN → check the `devices` row: `pin_hash` is a hash (confirm it is *not*
    the plaintext PIN), `pin_created_at`/`pin_expires_at` set (~30 days out),
    `pin_failed_attempts` at 0, `enrolled_at` set.
12. Sign out (not device-forget, just sign-out) → reload the app → PIN entry screen
    appears (asking for email + PIN, not just PIN) instead of forcing Google again.
13. Enter the correct PIN → lands on `/app/*`, same as a Google sign-in would.

**C. New device does NOT inherit an existing PIN**

14. On a **second, brand-new device/browser**, go straight to the PIN entry screen
    (skip Google) and try the correct email + the PIN from device #1 → must fail with
    "sign in with Google first on this device," even though the PIN is objectively
    correct.
15. On that second device, complete Google sign-in → confirm it's treated as
    first-time enrollment: the "Create a PIN" prompt appears again (a *new* PIN, not
    reusing device #1's).
16. Set a different PIN on device #2 → go back to device #1 → confirm device #1's
    original PIN still works there, and device #2's PIN does *not* work on device #1.

**D. Shared device, two different staff members**

17. On one shared browser, Staff A completes Google sign-in and sets PIN "1111."
18. On the *same* browser, Staff B (different Google account) signs in with Google →
    confirm B gets their own "Create a PIN" prompt (doesn't inherit A's), sets PIN
    "2222." Confirm in the DB: two separate `devices` rows, same `device_id`,
    different `member_id`.
19. On that shared browser, use the PIN screen: enter A's email + "1111" → logs in as
    A. Enter B's email + "2222" → logs in as B. Enter A's email + "2222" (B's PIN) →
    fails.
20. Confirm switching between A and B on the shared browser correctly swaps whose
    session/name is active in `/app/*`.
21. While A is the active cached member, confirm B's cached session is still present
    in Dexie (not deleted) and B can switch back to it — including offline, if B's
    JWT hasn't expired — without redoing Google sign-in.

**E. Lockout**

22. On an enrolled device, enter the wrong PIN 5 times in a row → on the 5th failure,
    the client shows: "Too many failed attempts. Please sign in with Google to reset
    your PIN."
23. After lockout, try the *correct* PIN → still rejected (locked, not just
    previously wrong).
24. Confirm lockout does **not** expire on its own — simulate time passing, correct
    PIN still rejected until Google re-auth is completed.
25. Complete Google sign-in again on the locked device → confirm this clears the lock
    and re-prompts for a new PIN (per subtask 6, every Google sign-in on that device
    re-triggers PIN creation).
26. On the shared device from scenario D, lock out Staff A's PIN → confirm Staff B's
    PIN still works normally, unaffected.
27. Confirm one device being locked doesn't lock the same member's *other* enrolled
    devices (use the member from scenario C: lock device #2, confirm device #1's PIN
    still works).

**F. PIN expiry**

28. Force/simulate `pin_expires_at` into the past (directly in the DB, since waiting
    30 days isn't practical) → attempt PIN login → rejected with a distinct "your PIN
    has expired — sign in with Google" message (not the generic wrong-PIN error).
29. Complete Google sign-in after expiry → confirm the new-PIN prompt appears and a
    fresh 30-day PIN can be set.

**G. JWT / session shape**

30. Decode a freshly minted JWT from both `mint-member-session` and `verify-pin` →
    confirm both produce the *same shape* (same claims structure), so downstream
    code can't tell which path was used.

**H. Login tracking (data only, no admin UI yet)**

31. After any successful `mint-member-session` or `verify-pin` call, check the
    `devices` row → `last_seen_at` updated to current time, `last_login_location`
    populated (whatever signal is available — IP-derived location, etc.).

**I. Sign In / Sign Up split, unified login page, Remember Me (Task 3)**

32. On the home page, confirm there are two visually distinct buttons: "Sign In"
    (shared `Button` styling, no Google branding) and "Sign up with Google" (the
    Google pill) — not two Google-styled buttons.
33. Click "Sign Up with Google" as a brand-new user → completes Google OAuth exactly
    as before, lands on `/auth/set-pin`, then `/no-store` — unchanged end-to-end.
34. Click "Sign In" → lands on `/login`, which shows both an email+PIN form and a
    "Sign in with Google" option, not just one or the other.
35. On `/login`, sign in with PIN, with "Remember me" checked → reload the page →
    email field is prefilled with the previously entered email.
36. Uncheck "Remember me," sign in again → reload the page → email field is empty
    (previously remembered email was cleared).
37. Confirm the old `/auth/pin` route no longer exists as a separate destination
    (either removed or redirects into `/login`) — no dead link left from any
    marketing page.

## Changelog
- **v1.5.0** — added Task 3 (4.5h, spec-only for now — implementation not yet
  started): a standard Sign In / Sign Up split instead of one Google button doubling
  as both. Confirmed with the founder: Sign Up stays Google-only (a PIN can't exist
  before a device's first Google sign-in); the new unified `/login` page offers both
  PIN and Google for a returning user; "Remember me" only persists the last-used
  email on this device (`localStorage`, purely client-side UX) — it does *not* change
  JWT/PIN expiry, which stays a fixed 30 days per Task 1/Task 2. Sign In restyled
  onto the shared `Button` component rather than a second Google-styled pill. Added
  Manual Test Plan group I (cases 32–37) and Task 3's own DoD.
- **v1.4.0** — added the Manual Test Plan (31 cases across Google sign-in, first
  enrollment, cross-device PIN isolation, shared-device multi-member, lockout,
  expiry, JWT shape, and login tracking), to be run by hand before/alongside
  automated tests once Task 1 and Task 2 are implemented.
- **v1.3.0** — aligned this spec with `specs/docs/M1-schema-reference.md` v1.1.0 (the
  now-authoritative, living schema doc, previously not found because it lives in
  `specs/docs/`, not `specs/tasks/`): `devices` gets a server-generated `id` surrogate
  key separate from the client-generated `device_id`, unique on `(device_id,
  member_id)`, so a shared device can hold more than one member's independent
  enrollment/PIN/lockout row — confirming and formalizing v1.2.0's shared-device fix.
  Dexie's client-side cache is explicitly keyed the same way (`member_id`, not a
  singleton), so multiple members can have valid cached sessions on one shared
  browser simultaneously, with one marked "active." Renamed `last_login_at` to
  `last_seen_at` to match the schema doc's existing column name. Softened the
  `M1-auth-google.md` conflict from "must be resolved before starting" to a
  documented, accepted divergence (that spec is partially implemented and, per
  project convention, `specs/tasks/` files aren't revised post-implementation — the
  reserved `pin` column there is simply left unused going forward).
- **v1.2.0** — addressed shared-device and cross-feature clarifications: `devices` is
  now keyed on the composite (`device_id`, `member_id`) so multiple staff sharing one
  counter device/browser get independent enrollment, PIN, and lockout state (this also
  resolves the "switching member on a shared device" question — it's now an intentional
  Dexie cache handoff, not a collision); JWT expiry set to 30 days to match
  `pin_expires_at`; PIN lockout (5 failed attempts) now explicitly clears only via
  Google re-auth, with a defined user-facing message; added `last_login_at`/
  `last_login_location` on `devices` as a lighter alternative to Edge-Function rate
  limiting, feeding a future admin portal (tracked in `constitution.md` §10 alongside
  device revocation, both explicitly deferred); added the "no store assigned"
  interstitial for a member with no store linkage (expected to fire for all sign-ins
  until M1b ships memberships).
- **v1.1.0** — corrected the PIN design to be per-device rather than per-member:
  `pin_*` columns move from `members` to `devices`, and a member must set a new PIN
  on each newly enrolled device rather than reusing one PIN across all of their
  devices. Updated Task 2 subtask 6/8 and both Definitions of Done accordingly.
- **v1.0.0** — initial task spec, transcribed from the founder-provided M1a spec.

## Notes

- `M1_Task_Plan.md` and `M1-schema-reference.md` live in `specs/docs/`, not
  `specs/tasks/` — both exist and are current as of `M1-schema-reference.md` v1.1.0.
- See the "Known, accepted divergence" note above regarding `M1-auth-google.md`.
- **"No store assigned" page and M1b:** the actual store/membership linkage
  (`memberships`, `access_grants`) doesn't exist until Phase M1b. In M1a, "no store
  assigned" just means the freshly upserted `members` row has no store relationship at
  all — which, before M1b ships, is *every* member, always. Treat this page as UI/route
  scaffolding built now (so M1b has somewhere to route a legitimately unassigned member
  once memberships exist), not as a fully meaningful check yet — it will effectively
  fire for 100% of sign-ins until M1b lands, which is expected, not a bug.
