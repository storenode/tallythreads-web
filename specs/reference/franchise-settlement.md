# Franchise Settlement — Franchise Store Support (Rule Engine)

**Status:** Draft, ready for implementation prep
**Parent docs:** `constitution.md` v1.10.0, `schema.md`
**Version:** 2.0.0

> **v2.0.0 (2026-09-05) — two founder-confirmed corrections, see §10 changelog.**
> (1) Bandrip's royalty is charged on the store owner's **post-expense** balance
> (after stock share *and* the store's own running expenses), not on the post-share
> remainder the v1.0.0 worked example used. (2) The engine is now an explicit
> **hybrid**: a data-driven config recipe by default, with a coded-plugin fallback in
> a whitelist registry for contracts the primitive set can't express — see §4.5. Both
> confirmed with the founder, whose family owns the real Nellore Bandrip store; the
> Nellore September statement (₹4,00,000 → owner take-home ₹1,06,140) is the golden case.

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
- The generalized `access_grants` primitive (already planned in `schema.md`),
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
-- see schema.md §1). Used here so the franchisor can see its
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
-- renegotiated contract doesn't silently rewrite history.
--
-- HYBRID resolution (§4.5): exactly one of `config` or `plugin_id` is set.
--   • config    — a data-driven recipe of primitives (§4.1). The default path:
--                 a new customer whose terms fit existing primitives is onboarded
--                 by inserting this row alone, no code change, no redeploy.
--   • plugin_id — the string key of a coded plugin in the whitelist registry
--                 (§4.5). The fallback path for a contract the primitives can't
--                 express; requires a developer to add the plugin + an off-hours
--                 redeploy. NEVER interpreted as code — only matched against the
--                 registry (see §4.6 security rule).
create table settlement_rules (
  id                  uuid primary key default gen_random_uuid(),
  franchise_group_id  uuid not null references franchise_groups(id),
  config              jsonb,                 -- data-driven recipe; see §4.1
  plugin_id           text,                  -- coded-plugin key; see §4.5
  effective_from      date not null,
  effective_to        date,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint settlement_rules_one_source
    check ((config is not null) <> (plugin_id is not null))  -- exactly one
);
-- ⚠️ TARGET (M1d) shape. The LIVE table today has `config jsonb NOT NULL` and no
-- `plugin_id`/one-source check yet (see `schema.md` §3). Adding `plugin_id` + the check
-- is part of the M1d migration, not yet applied.

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

## 4. Settlement rule engine (hybrid: data-driven recipe + coded-plugin fallback)

The founder's mental model came from Java: a new customer gets a bespoke agreement
class, mapped to the customer record in the DB, loaded at runtime by reflection, with a
per-customer redeploy accepted. The design below is the TypeScript equivalent — but
built so that **most** new customers need no redeploy at all, and only genuinely novel
contract shapes fall back to the "new class + redeploy" path.

There are two resolution paths, chosen per `settlement_rules` row (§3):

- **§4.1 Data-driven recipe (default).** The agreement is a JSON list of primitive
  steps. Onboarding a customer whose terms fit the existing primitives = insert one
  `settlement_rules` row with a `config`. No code, no redeploy.
- **§4.5 Coded plugin (fallback).** A contract the primitives can't express is handled
  by a coded plugin registered under a string key; the row carries `plugin_id` instead
  of `config`. This is the direct analogue of the Java "new agreement class" path —
  developer writes + tests the plugin, off-hours redeploy.

### 4.1 Primitives (used by both paths)

| Type | What it does | To franchisor? |
|---|---|---|
| `percentage_of_gross` | `rate` × the original monthly gross revenue | yes |
| `percentage_of_remainder` | `rate` × whatever's left after prior steps have been deducted | yes |
| `fixed_fee` | A flat amount, independent of revenue | yes |
| `minimum_guarantee` | Tops the franchisor's total up to at least `amount`, if the steps above give less | yes |
| `deduct_expenses` | Subtracts the store's own reported monthly running expenses (rent, power, utilities, salesperson salary, …) from the running base | **no** — a store cost, not a transfer to the franchisor |

The **"To franchisor?"** column is the key v2.0.0 addition. The engine tracks two
different things and must not conflate them:

- the **running base** — starts at gross revenue, reduced by *every* step (used as the
  base for later `percentage_of_remainder` steps, and its final value is the store
  owner's take-home);
- **total to franchisor** — the sum of only the steps flagged *yes* above.

`deduct_expenses` reduces the running base (so it lowers a later royalty's base and the
owner's take-home) but is paid to third parties — landlord, power company, staff — never
to the franchisor. This is exactly why Bandrip's royalty on ₹4,00,000 sales is ₹15,860
(13% of the ₹1,22,000 post-expense balance), not ₹26,000 (13% of the ₹2,00,000
post-share remainder the v1.0.0 draft computed).

Any `percentage_of_gross` or `percentage_of_remainder` step may carry a `condition`:
`{ metric: "gross_revenue", operator: ">" | ">=", threshold_paise, basis: "cliff" | "slab" }`.
`cliff` means the step applies to its full base once the condition is true; `slab` means
it applies only to the amount exceeding the threshold. Note the condition's `metric` (what
gates the step) is independent of the step's base (what it multiplies): Bandrip's royalty
is *gated* on gross revenue crossing ₹3,00,000 but *charged* on the post-expense base.

### 4.2 Engine algorithm

Process steps in order. Maintain `base` (initialized to gross revenue) and
`toFranchisor` (0). For each step: evaluate its `condition` (if any) against the chosen
`metric` — for a `cliff` a failed condition contributes ₹0; compute the step amount;
subtract it from `base`; if the primitive is a franchisor transfer, add it to
`toFranchisor`; record `{ label, amount_paise, to_franchisor }` in the breakdown. Final
output: `{ breakdown, total_to_franchisor_paise: toFranchisor, store_net_paise: base }`.
All arithmetic in integer paise, rounding rule per §9.2 — never floats (`src/lib` rule).

### 4.3 Bandrip's contract, expressed as a data-driven recipe

```json
{
  "steps": [
    { "type": "percentage_of_gross", "rate": 0.50, "label": "stock_replacement" },
    { "type": "deduct_expenses", "label": "store_expenses" },
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

### 4.4 Worked examples (the golden tests)

Store running expenses held at ₹78,000 across rows to isolate the cliff behaviour; the
₹4,00,000 row is the **real Nellore September statement** and is the primary golden case.
`royalty` is 13% of the post-expense balance, and only when gross **> ₹3,00,000** (`>`,
so exactly ₹3,00,000 pays no royalty — confirmed, §9.1).

| Gross | stock share (50%) | expenses | pre-royalty balance | gross > ₹3L? | royalty (13% of balance) | → franchisor (stock+royalty) | owner take-home |
|---|---|---|---|---|---|---|---|
| ₹2,50,000 | ₹1,25,000 | ₹78,000 | ₹47,000 | no | ₹0 | ₹1,25,000 | ₹47,000 |
| ₹3,00,000 | ₹1,50,000 | ₹78,000 | ₹72,000 | no (= 3L) | ₹0 | ₹1,50,000 | ₹72,000 |
| ₹3,00,001 | ₹1,50,000.50 | ₹78,000 | ₹72,000.50 | yes | ₹9,360.07 | ₹1,59,360.57 | ₹62,640.43 |
| **₹4,00,000** | **₹2,00,000** | **₹78,000** | **₹1,22,000** | **yes** | **₹15,860** | **₹2,15,860** | **₹1,06,140** |

(Store expenses are a runtime input to the settlement, supplied per period per store —
not part of the agreement terms. The engine reads them from the store's recorded monthly
expenses; where those come from is a Settings/bookkeeping concern, not this engine's.)

### 4.5 Coded-plugin fallback (the Java "new agreement class" equivalent)

When a contract has a term the primitives genuinely can't express — a seasonal rate, a
payout cap, a rate tied to year-over-year growth, a formula with cross-period memory —
the fallback is a coded plugin, not a hacked config:

```ts
interface SettlementPlugin {
  id: string;        // e.g. "humtum-growth-tiered-v1" — matches settlement_rules.plugin_id
  version: string;
  compute(input: SettlementInput): SettlementResult;   // same in/out contract as §4.2
}

// The registry IS the reflection substitute. JS functions are first-class, so a plain
// string→plugin map does exactly what Java classpath reflection did — but resolved at
// O(1) and type-checked at build time, so a bad key fails before deploy, not at runtime.
const PLUGIN_REGISTRY: Record<string, SettlementPlugin> = {
  "bandrip-fofo-v1": bandripFofoV1,   // (Bandrip can also stay a §4.3 recipe; shown here only as an example)
  // new coded agreements are added here, one line, + an off-hours redeploy
};

export function computeSettlement(rule: SettlementRuleRow, input: SettlementInput) {
  if (rule.config)    return runRecipe(rule.config, input);     // §4.1 path
  if (rule.plugin_id) return PLUGIN_REGISTRY[rule.plugin_id].compute(input);  // §4.5 path
  throw new Error("settlement_rules row has neither config nor plugin_id");
}
```

Both paths return the identical `SettlementResult` shape, so the persisted statement and
the UI are agnostic to which path produced them. Prefer a recipe; reach for a plugin only
when the recipe genuinely can't express the terms — and when a plugin is needed, if the
missing capability is reusable (a payout cap, a growth tier), add it as a **new primitive**
so the next customer gets it as config, rather than letting coded plugins accumulate.

### 4.6 Security rule — never interpret DB data as code

`settlement_rules.config` and `.plugin_id` are database rows, i.e. untrusted input under
the project's RLS model. The engine MUST:

- select primitives and plugins only by matching a string key against a **fixed
  whitelist** (the primitive table in §4.1, the registry in §4.5);
- treat all recipe values (`rate`, `threshold_paise`, `amount`) as numbers only;
- **never** use `eval`, `new Function`, dynamic `import()` of a DB-supplied path, or any
  other mechanism that turns stored data into executable code.

An unknown `type`/`plugin_id` is a hard error, never a silent skip. This is strictly safer
than the Java reflection model it replaces — there is no path by which a crafted DB row
can execute arbitrary logic.

---

## 5. Multi-store/chain — explicitly outside this engine's scope

A chain-owned store has no `franchise_memberships` row, so no `settlement_rules` config
exists for it and the engine never runs. 100% of that store's revenue is simply the
owner's own, recorded directly — not "split 100/0" through the engine. This keeps the
two models cleanly separated even though they share the `stock_locations`/`stock_transfers`
backbone (`schema.md` §1): a chain's internal stock movement never
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
      `fixed_fee`, `minimum_guarantee`, `deduct_expenses`, `cliff`, `slab`) has independent
      unit test coverage (constitution §2.V — same rigor as `gstCalc.ts`)
- [ ] Bandrip's §4.3 recipe is tested against all four §4.4 worked-example rows, with the
      **₹4,00,000 → ₹1,06,140 Nellore row as the primary golden case**, and the exact
      ₹3,00,000 boundary (`>`, no royalty at exactly 3L) tested explicitly
- [ ] The `to_franchisor` distinction is tested: `deduct_expenses` lowers both the royalty
      base and owner take-home but is NOT included in `total_to_franchisor_paise`
- [ ] The hybrid resolver is tested both ways: a `config` row runs the recipe path, a
      `plugin_id` row runs the registered plugin, and a row with neither/both is a hard error
      (the `settlement_rules_one_source` check + the resolver guard)
- [ ] Security (§4.6): an unknown primitive `type` or an unregistered `plugin_id` throws a
      hard error and is never silently skipped; no code path passes DB data to `eval` /
      `new Function` / dynamic `import()`
- [ ] A chain-owned store (no `franchise_memberships` row) produces no settlement
      statement at all — explicit regression test for §5
- [ ] A `settlement_statement`, once computed, is never silently recalculated — a
      contract change creates a new `settlement_rules` version effective from a future
      date, past statements stay as issued
- [ ] A franchisor's dashboard/API access shows only stores it holds an active,
      unexpired `access_grants` row for — never more, and never another franchisor's stores

---

## 9. Open questions

1. ✅ **Resolved (2026-09-05):** the ₹3,00,000 boundary is `>` (exactly ₹3,00,000 pays no
   royalty) and the royalty base is the store owner's **post-expense** balance — both
   confirmed by the founder against the real Nellore Bandrip agreement (§4.4). Still to
   pin before tests: whether the *gross* the threshold gates on is gross-with-GST or
   taxable value.
2. Settlement cadence and rounding rule (calendar month? any particular day cutoff?).
   §4.2 assumes integer-paise; the specific rounding direction per step is still open.
3. Does the ₹3L threshold apply per store, or aggregated across every store one
   franchisor supplies? (Matters once Bandrip has more than one store on TallyThreads.)
4. Should a franchisee ever see the *formula*, or only their own resulting statement?
   (Affects what `access_grants`/UI expose back to the store owner.)
5. Where does `deduct_expenses` read the store's monthly expenses from? (§4.4 treats them
   as a per-period input; the recording surface — Settings vs. a light bookkeeping screen
   — isn't decided, and touches the Operations roadmap discussion still to come.)

## 10. Changelog

- **v2.0.0 (2026-09-05)** — Two founder-confirmed corrections after working through the
  real Nellore Bandrip September statement with the founder (whose family owns that store):
  (1) **Royalty base corrected** — charged on the post-expense owner balance, not the
  post-share remainder; added the `deduct_expenses` primitive and the `to_franchisor`
  distinction to §4, corrected the worked-example table (§4.4) so ₹4,00,000 → ₹1,06,140
  matches the real statement. (2) **Engine made an explicit hybrid** — a data-driven
  recipe by default plus a coded-plugin fallback in a whitelist registry (§4.5), the
  TypeScript answer to the founder's Java-reflection question, with a no-`eval` security
  rule (§4.6). Added `plugin_id` to `settlement_rules` with a one-source check (§3).
  Resolved open question 1's boundary/base halves; added open question 5. Constitution
  §2.V amended in step (v1.10.0, §8 changelog).
- **v1.0.0** — initial franchise linkage + settlement engine design (data-driven config
  only; royalty on post-share remainder).
