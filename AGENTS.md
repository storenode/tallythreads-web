# TallyThreads — start here

**TallyThreads** is a cloth-store operating system (PWA) for Indian garment retailers —
independent, chain, and franchise. Built solo (founder + Codex). React 18 + Vite +
TypeScript + Tailwind, Supabase (Postgres/Auth/Storage/Edge Functions), Dexie for offline.

## Read the specs before working

The full context lives in [`specs/`](specs/README.md). Read in this order:

1. [`specs/constitution.md`](specs/constitution.md) — binding rules, vision, scope.
2. [`specs/roadmap/status.md`](specs/roadmap/status.md) — what's built, what's next.
3. [`specs/reference/`](specs/reference/) — schema (source of truth = the live Supabase DB),
   roles/permissions, franchise settlement.
4. [`specs/journal/`](specs/journal/) — latest dated entries for recent decisions.

## Non-negotiables

- **No file or code changes without the founder's explicit go-ahead** (constitution §9).
- **The live Supabase DB is the schema source of truth.** `specs/reference/schema.md` is kept
  to match it (re-verify with `supabase db dump --linked --schema public`).
- **Test the money logic** (GST, landed cost, franchise settlement) — constitution §2.V.
- **Offline-first**: every write path goes through Dexie first (constitution §2.I).
- End each working session with a dated entry in `specs/journal/YYYY-MM.md`.

## Commands

```bash
pnpm dev          # run the app
pnpm test         # vitest
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # oxlint
```
