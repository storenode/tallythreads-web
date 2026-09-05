# M10 — Shift & Store Operations Log

**Status:** Planned (design; not started)
**Version:** 0.1.0
**Est:** 24 hrs (constitution §5) — Phase 1 ~12h, Phase 2 ~4h, Phase 3 ~8h
**Tracking:** open a GitHub issue when this moves to a scheduled build (see `workflow.md`)
**Parent docs:** `../constitution.md` §2.VI/§3/§5/§8 (the 2026-09-05 amendment bringing this
into scope), `../reference/schema.md` (tables land here once migrated),
`../reference/roles-and-permissions.md` (approval uses the existing entitlements),
`../reference/franchise-settlement.md` (this module feeds its `deduct_expenses` inputs)

## What this is

Everything QueueBuster (Bandrip's current POS) and the other billing-first competitors
don't capture: what happens *inside* a store shift. When a sales person signs in to a
store and later signs off, TallyThreads records:

1. **Working hours / attendance** — derived automatically from login→logoff timestamps.
2. **Petty-utility expenses, with approval** — the small day-to-day store costs a sales
   person incurs (tea/coffee/drinking-water refills, puja supplies, sundries): the staff
   member logs the expense; an owner/manager approves or rejects it.
3. **End-of-shift handover note** — before signing off, the sales person records notes
   for the next shift (e.g. "rack 3 low on stock", "customer X returning tomorrow").
   Later phase: Claude helps phrase the note (server-side only).

**Who sees it:** store-facing (`store_sales_staff`/`store_temp_staff` create; owner/manager
approve and review). It is a real near-term win for Nellore/Tirupati/Bandrip and a
differentiator to sell TallyThreads on.

**Why it belongs in the product (not scope creep):** it is store operations, not loyalty
or commission (which stay out — constitution §3). And it has a clean architectural payoff:
its **hours (→ salary)** and **petty expenses (→ utilities)** are exactly the store-expense
figures the **franchise settlement engine (M1d)** deducts before royalty (see the Nellore
₹78,000 store-expenses line in `../reference/franchise-settlement.md` §4.4). M10 produces
that data honestly instead of it being typed in by hand.

## Scope

**In scope (phased — ship thinnest slice first):**
- **Phase 1 (~12h):** shift login/logoff capture + working-hours derivation; petty-expense
  *capture* (category, amount, note); a store-scoped list/history. No approval, no AI yet.
- **Phase 2 (~4h):** petty-expense **approval workflow** — pending → approved/rejected by an
  owner/manager, with who/when recorded.
- **Phase 3 (~8h):** **AI-assisted handover note** — a Claude Edge Function that helps the
  sales person phrase/summarize their end-of-shift note. Server-side key only.

**Explicitly out of scope:**
- Staff **commission** (a cut of sales) — constitution §3 non-goal, stays out.
- Payroll/salary *disbursement* — M10 records hours; it does not pay salaries.
- Biometric/GPS attendance, geofencing — not now.
- The AI Studio marketing-content module (`future/ai-studio.md`) — different module; M10's
  AI is operational notes only.

## Data model (sketch — not final; real DDL when scheduled, added to `../reference/schema.md`)

```sql
create table shifts (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id),
  member_id      uuid not null references members(id),
  login_at       timestamptz not null default now(),
  logout_at      timestamptz,                       -- null = shift open
  handover_note  text,
  note_ai_assisted boolean not null default false,
  created_at     timestamptz not null default now(),
  last_modified_at timestamptz not null default now(),
  deleted_at     timestamptz
);

create table petty_expenses (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id),
  member_id      uuid not null references members(id),   -- who spent
  shift_id       uuid references shifts(id),             -- optional link
  category       text not null,                          -- tea|coffee|water|puja|other (final list TBD)
  amount_paise   bigint not null,                        -- integer paise, never floats
  note           text,
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  approved_by    uuid references members(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  last_modified_at timestamptz not null default now(),
  deleted_at     timestamptz
);
```

Both follow project conventions (soft delete, `last_modified_at` for LWW, integer paise).

## Access / roles

- Create a shift + petty expense: `store_sales_staff` / `store_temp_staff` (store-scoped).
- Approve/reject an expense: `org_owner` / `org_manager` (and, if/when seeded, a
  store-scoped `store_manager` — currently "Named", see `../reference/roles-and-permissions.md`
  §6). New permission keys will be needed, e.g. `shift.write`, `expense.write`,
  `expense.approve` — seeded following the existing `has_store_permission` pattern.

## Offline (constitution §2.I)

Shift punch and expense entry happen at the counter and must tolerate no network — but the
**M2 offline sync engine is not built yet**. Decision still open (see §Open questions):
build M10 **online-first** now and retrofit sync when M2 lands (documented debt), or wait
for M2. Given M10 is small and store-facing, online-first-then-retrofit is the likely call
but is not yet decided.

## Money logic

Petty expenses are simple sums, not a complex calculation like GST or settlement, so they
don't need §2.V's full test rigor — but amounts are integer paise and the approved-total
per period must reconcile exactly with what M1d reads as store `utilities` expense. That
reconciliation (M10 approved petty total → M1d `deduct_expenses`) is worth an integration
test when both exist.

## Definition of Done (draft — firm up when scheduled)

- [ ] A sales person can start a shift on login and end it on logoff; working hours are
      derived correctly, including a shift left open across midnight (define the rule).
- [ ] A petty expense can be logged with category + amount (paise) + note, scoped to the
      store, and appears in that store's history.
- [ ] Phase 2: an owner/manager approves/rejects an expense; status + approver + timestamp
      recorded; a `store_sales_staff` member cannot approve their own (verified server-side).
- [ ] Phase 3: the AI handover-note helper calls Claude via an Edge Function with a
      server-held key (no key client-side); the note is saved with `note_ai_assisted=true`.
- [ ] Works at 375px (constitution §7); offline behavior matches whatever §Open-questions
      decision is taken.
- [ ] Approved petty-expense total for a period reconciles with M1d's `deduct_expenses`
      input for that store (integration test, once M1d exists).

## Open questions

1. **Offline timing:** online-first now + M2 retrofit, or wait for M2?
2. **Expense categories:** fixed list (tea/coffee/water/puja/other) or free-form + tag?
   And a per-expense or per-day cap before approval is mandatory?
3. **Who approves** — `org_owner`/`org_manager` only, or seed `store_manager` now so a
   branch has a local approver? (Ties to `roles-and-permissions.md` §6.)
4. **Shift model:** one open shift per (member, store) at a time? What happens to a shift
   never logged off (auto-close at store `closing_time`? next login?)?
5. **AI note (Phase 3):** what exactly does Claude do — summarize bullet points, translate
   Telugu↔English, or suggest structure? And which model/budget (see `claude-api` guidance)?

## Changelog

- **v0.1.0 (2026-09-05)** — Initial design, written the same session the module moved into
  scope (constitution §8's 2026-09-05 M10 entry). Design + phasing only; no code. Build
  timing (and the offline decision) deliberately left open pending the roadmap discussion.
