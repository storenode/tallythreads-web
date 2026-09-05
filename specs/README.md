# TallyThreads — Specs

**TallyThreads is a cloth-store operating system** for Indian garment retailers —
independent, chain, and franchise stores. Built solo (founder + Claude), ~10 hrs/week, as a
real launch with Bandrip (a family franchise) as the first customer. Its one differentiator
is the **Purchase-Trip → landed-cost** flow for owners who travel to source stock.

This folder is the project's brain. Read it in this order and you have the whole picture.

## 📖 Reading order (for any human or AI partner)

1. **[`constitution.md`](constitution.md)** — the rules, vision, scope, and non-goals. Binding. Start here.
2. **[`roadmap/status.md`](roadmap/status.md)** — where we are right now and what's next.
3. **[`reference/`](reference/)** — how the system is actually built:
   - [`schema.md`](reference/schema.md) — the live database (verified against Supabase; source of truth)
   - [`roles-and-permissions.md`](reference/roles-and-permissions.md) — the RBAC catalog
   - [`franchise-settlement.md`](reference/franchise-settlement.md) — the franchise settlement engine
4. **[`journal/`](journal/)** — the dated dev log. Read the latest entries for recent decisions and context that isn't in the code yet.

## 🗂️ Layout

```
specs/
  constitution.md        Rules & vision (rarely changes)
  reference/             How it's built — durable (changes with the system)
  roadmap/               What's next — plans, status, future modules
    future/              Sketches for unscheduled modules
  journal/               What we did, when — append-only dev log
  README.md              This file
```

Organized by **purpose / rate-of-change**, not by document type. Filenames say what a file
is for (`schema.md`, not `M1-schema-reference.md`) — module IDs (M1, M2…) live inside the
files, tied to the constitution's §5 roadmap.

## ✍️ Working conventions

- **No code changes without the founder's explicit go-ahead** (constitution §9).
- **The live Supabase DB is the source of truth** for schema; `reference/schema.md` is kept to match it.
- **End each working session** with a dated entry in the current month's `journal/` file — so a fresh chat can pick up full context without re-reading a giant conversation. See [`journal/README.md`](journal/README.md).
- How work is tracked (specs → issues → commits): [`roadmap/workflow.md`](roadmap/workflow.md).
