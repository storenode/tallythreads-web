# M1-franchise-model — Franchise Store Support (Settlement Rule Engine)

**Status:** Draft, ready for implementation prep
**Parent docs:** `constitution.md` v1.2.0, `store-model-master-plan.md`
**Version:** 1.0.0

---

## 0. What this is

Franchise (constitution §2.IX item #3) moved into Phase 1 because a real case exists —
Bandrip, the founder's family's own franchise store. This spec covers three things that
don't exist anywhere else yet: linking a franchisor to its franchisee stores, a
configurable engine for computing what a franchise store owes its franchisor each month,
and the stock-receipt flow that replaces Purchase-Trip for these stores.

**This spec does not apply to Multi-store/chain at all.** See §5 for why — it's a
deliberate design point, not an oversight.

---

## 1. Scope

**In scope:**

- `franchise_groups` linking a franchisor `organization` to one or more franchisee stores
- The generalized `access_grants` primitive (already planned in `store-model-master-plan.md`),
  applied here to give a franchisor read-only visibility into its linked stores
- A **settlement rule engine**: a small set of reusable calculation primitives, plus a
  per-franchise-agreement configuration (data, not code) expressing that contract's terms
- Persisted monthly settlement statements (audit trail — never silently recomputed after
  the fact)
- A **goods-received-from-franchisor** stock flow, replacing Purchase-Trip for franchise
  stores (constitution §2.IV)

**Out of scope (deferred):**

- The franchisor dashboard's actual UI polish (the access mechanism is speced here; the
  screens are a later build task)
- Wholesale/distributor and Omnichannel (separate, still-deferred docs)
- Contract structures the primitive set below can't express — see §4's limits

---

## 2. Franchise vs. Multi-store/chain — the dividing line

Both models can have a central stock point supplying multiple stores, so it's easy to
conflate them. The actual test: **does revenue get split between two separate parties by
contract, or does it all belong to one owner already?** If a percentage of revenue or a
royalty changes hands between the store and whoever supplies it, that's Franchise. If
it's one owner's own locations with no revenue-sharing agreement, that's Multi-store/chain
— and Multi-store/chain never needs anything in this document.

---

## 3. Data model

```sql
create table franchise_groups (
  id                uuid primary key default gen_random_uuid(),
  franchisor_org_id uuid not null references organizations(id),
  name              text not null,          -- e.g. "Bandrip"
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Links a specific store to a franchise group for a period of time
create table franchise_memberships (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id),
  franchise_group_id  uuid not null references franchise_groups(id),
  agreement_start     date not null,
  agreement_end       date,                 -- null = still active
  created_at          timestamptz not null default now(),
  last_modified_at    timestamptz not null default now(),
  deleted_at          timestamptz
);

-- The generic cross-tenant read primitive (shared with Platform Owner access —
-- see store-model-master-plan.md §1). Used here so the franchisor can see its
-- franchisees' data without breaking normal store isolation for anyone else.
create table access_grants (
  id                uuid primary key default gen_random_uuid(),
  grantee_member_id uuid not null references members(id),
  scope_type        text not null check (scope_type in ('organization', 'store')),
  scope_id          uuid not null,
  permission        text not null check (permission in ('read_only', 'reports_only', 'full')),
  granted_by        uuid not null references members(id),
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- One row per franchise agreement's terms, versioned by effective date so a
-- renegotiated contract doesn't silently rewrite history
create table settlement_rules (
  id                  uuid primary key default gen_random_uuid(),
  franchise_group_id  uuid not null references franchise_groups(id),
  config              jsonb not null,        -- see §4 for shape
  effective_from      date not null,
  effective_to        date,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- The actual computed result for one store, one period — persisted, never
-- silently recomputed after the fact once issued
create table settlement_statements (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id),
  period_start      date not null,
  period_end        date not null,
  gross_revenue_paise bigint not null,
  breakdown         jsonb not null,          -- step-by-step results, see §4
  total_to_franchisor_paise bigint not null,
  store_net_paise   bigint not null,
  computed_at       timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);
```

All money fields use the existing integer-paise convention (`src/lib`'s established rule
— never floats).

---

## 4. Settlement rule engine

Rather than one hand-written function per franchise customer, the engine walks an ordered
list of steps, each drawn from a small set of primitives. Onboarding a new franchise
customer means expressing their contract as this configuration — reviewed against real
worked numbers from their agreement — not writing new code.

**Primitives:**

| Type                      | What it does                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `percentage_of_gross`     | Takes `rate` × the original monthly gross revenue                                       |
| `percentage_of_remainder` | Takes `rate` × whatever's left after prior steps have been deducted                     |
| `fixed_fee`               | A flat amount, independent of revenue                                                   |
| `minimum_guarantee`       | Tops up the franchisor's total to at least `amount`, if the steps above would give less |

Any `percentage_of_gross` or `percentage_of_remainder` step may carry a `condition`:
`{ metric: "gross_revenue", operator: ">" | ">=", threshold_paise, basis: "cliff" | "slab" }`.
`cliff` means the step applies to its full base once the condition is true; `slab` means
it applies only to the amount exceeding the threshold. (Bandrip's royalty is a cliff —
see the worked example below and the corrected math in `store-model-master-plan.md` §5.)

The engine processes steps in order, starts a running remainder at gross revenue, and
for each step: evaluates its condition (if any) against gross revenue, computes the
step's amount, subtracts it from the remainder, and records `{label, amount_paise}` in
the output breakdown. Final output: `{ breakdown, total_to_franchisor_paise, store_net_paise }`.

**Bandrip's contract, expressed as configuration:**

```json
{
  "steps": [
    {
      "type": "percentage_of_gross",
      "rate": 0.5,
      "label": "stock_replacement"
    },
    {
      "type": "percentage_of_remainder",
      "rate": 0.13,
      "label": "royalty",
      "condition": {
        "metric": "gross_revenue",
        "operator": ">",
        "threshold_paise": 30000000,
        "basis": "cliff"
      }
    }
  ]
}
```

**Worked example (paise omitted for readability — see `store-model-master-plan.md` §5
for the full table and the open boundary/basis questions):**

| Gross revenue | stock_replacement | royalty    | Total to franchisor | Store net    |
| ------------- | ----------------- | ---------- | ------------------- | ------------ |
| ₹2,50,000     | ₹1,25,000         | ₹0         | ₹1,25,000           | ₹1,25,000    |
| ₹3,00,000     | ₹1,50,000         | ₹0         | ₹1,50,000           | ₹1,50,000    |
| ₹3,00,001     | ₹1,50,000.50      | ₹19,500.07 | ₹1,69,500.57        | ₹1,30,500.43 |
| ₹3,50,000     | ₹1,75,000         | ₹22,750    | ₹1,97,750           | ₹1,52,250    |

**Real limit of this pattern:** some contracts will have a term these primitives can't
express — a seasonal rate, a payout cap, a rate tied to year-over-year growth. When that
happens, the right move is to add a new primitive (so every future franchise benefits),
not a one-off function scoped to a single customer. If that keeps happening, it's a
signal the primitive set needs expanding — not a reason to abandon the pattern.

---

## 5. Multi-store/chain — explicitly outside this engine's scope

A chain-owned store has no `franchise_memberships` row, so no `settlement_rules` config
exists for it and the engine never runs. 100% of that store's revenue is simply the
owner's own, recorded directly — not "split 100/0" through the engine. This keeps the
two models cleanly separated even though they share the `stock_locations`/`stock_transfers`
backbone (`store-model-master-plan.md` §1): a chain's internal stock movement never
implies a payment; a franchise's does.

---

## 6. Goods-received-from-franchisor flow

Replaces Purchase-Trip for franchise stores (constitution §2.IV — a franchise store
doesn't source its own stock). A `stock_transfer` record moves goods from the
franchisor's `stock_location` to the store: quantity, received date, and condition are
logged, but there's no landed-cost calculation — the franchisor has already priced the
goods. This is a materially simpler flow than Purchase-Trip, not a variant of it.

---

## 7. Franchisor dashboard (built on `access_grants`)

A franchisor's read access to its linked stores is just an `access_grants` row per
franchisor-side member, scoped to each linked store (or the whole `franchise_group`),
permission `reports_only` or `read_only`. No new access-control mechanism is needed — the
same primitive that gives the Platform Owner visibility does this. Actual dashboard
screens (sales summary, settlement statements, inventory levels) are a later build task;
this spec only fixes the access mechanism.

---

## 8. Definition of Done

- [ ] Each rule-engine primitive (`percentage_of_gross`, `percentage_of_remainder`,
      `fixed_fee`, `minimum_guarantee`, `cliff`, `slab`) has independent unit test coverage
      (constitution §2.V — same rigor as `gstCalc.ts`)
- [ ] Bandrip's specific configuration is tested against all four worked-example figures
      above, including the exact ₹3,00,000 boundary once confirmed against the real
      agreement
- [ ] A chain-owned store (no `franchise_memberships` row) produces no settlement
      statement at all — explicit regression test for §5
- [ ] A `settlement_statement`, once computed, is never silently recalculated — a
      contract change creates a new `settlement_rules` version effective from a future
      date, past statements stay as issued
- [ ] A franchisor's dashboard/API access shows only stores it holds an active,
      unexpired `access_grants` row for — never more, and never another franchisor's stores

---

## 9. Open questions

1. Confirm the exact ₹3,00,000 boundary (`>` vs `>=`) and revenue basis (gross-with-GST
   vs. taxable value) against Bandrip's real signed agreement before writing tests.
2. Settlement cadence and rounding rule (calendar month? any particular day cutoff?).
3. Does the ₹3L threshold apply per store, or aggregated across every store one
   franchisor supplies? (Matters once Bandrip has more than one store on TallyThreads.)
4. Should a franchisee ever see the _formula_, or only their own resulting statement?
   (Affects what `access_grants`/UI expose back to the store owner.)
