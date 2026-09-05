# Journal — how to use it

This is the rolling development log. It's how TallyThreads keeps continuity across many
separate Claude chats: instead of carrying one ever-growing conversation, we **write down
what happened at the end of each working session**, and a fresh chat rebuilds full context
by reading `constitution.md` → `roadmap/status.md` → `reference/` → the latest entries here.

## Format

- **One file per month**, named `YYYY-MM.md` (e.g. `2026-09.md`). Fewer files; a whole
  month scans at once.
- **Newest entry at the top** of the file, under a `## YYYY-MM-DD — <short title>` heading.
- Keep each entry short and skimmable. Use these four lines:

```markdown
## 2026-09-05 — <what this session was about>
**Did:** what changed (files, decisions, features).
**Decisions:** anything now settled (with the number/value, not just "discussed X").
**Next:** the immediate next step.
**Open:** questions still unresolved.
```

## What belongs here vs. elsewhere

- **Journal** — the narrative of *what we did and decided, when*. Point-in-time.
- **`reference/`** — the *current* state of the system. When a decision changes how the
  system works, update the reference doc too; the journal records that it happened.
- **`roadmap/status.md`** — the *current* board. Update it; the journal notes the change.
- **`constitution.md`** — durable rules. A real amendment goes there (with its own §8 entry),
  and the journal cross-links to it.

The journal is the project's git-tracked memory; it's separate from Claude's own private
memory. When in doubt, write it here — a line in the journal is cheaper than a lost decision.
