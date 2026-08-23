# StoreParda — Multi-Store-Model Master Plan

**Purpose:** map all 8 store models onto one shared architecture, decide what Phase 1
actually builds, and lay out what later phases need — so nothing gets built twice and
nothing gets boxed in.

**Updated 2026-08-21:** Franchise moved into Phase 1 — the founder's wife's store
(Bandrip) is a real near-term case, not a hypothetical. See §5 for the settlement-engine
design this adds.

**Updated 2026-08-21 (later):** M1 design is now complete — see §4, all four docs are
written, and `M1-task-plan.md` has the finalized ~102h estimate feeding into
`constitution.md`'s revised 404h project total.

---

## 1. The shared core

Six entities cover all 8 models if designed generally instead of bespoke per model:

| Entity                                    | What it is                                                                                                                                                                                                                                                                                                                                                    | Which models need it                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **`organizations`**                       | The top-level billing/subscription entity — "who StoreParda has a customer relationship with." An independent owner, a chain owner, a franchisor brand, a distributor's business are all just an `organization`.                                                                                                                                              | All 8                                                                                      |
| **`stores`**                              | A physical (or virtual) selling point. Already exists in the plan; unchanged.                                                                                                                                                                                                                                                                                 | All 8                                                                                      |
| **`members` + `memberships`**             | `members` = a verified person (unchanged from the Google/PIN work). `memberships` = a new join: `member_id` + `organization_id` and/or `store_id` + `role`. This is what already had to exist for Multi-store/chain (one owner, many stores) — it generalizes to every model without new concepts.                                                            | All 8                                                                                      |
| **`access_grants`**                       | One generic grant instead of a franchise-specific feature: `{grantee_member_id, scope (org or store), permission (read_only / reports_only / full), granted_by, expires_at}`. Platform Owner access, a franchisor's read visibility into franchisees, and a future accountant/auditor read-only login are all _the same primitive_ used three different ways. | Platform Owner (now), Franchise (now, per the update above), any future read-only party    |
| **`channels`**                            | A store can sell through more than one channel — `pos` today, `online` later. Invoices/inventory reservations get scoped by channel.                                                                                                                                                                                                                          | Omnichannel mainly; harmless to have for everyone else (they just have one channel: `pos`) |
| **`stock_locations` + `stock_transfers`** | A central stock point (a godown/warehouse) that distributes to one or more stores. A transfer record moves stock from a location to a store — reduces the source, increases the destination. This is pure logistics and doesn't care who owns what; a chain's own warehouse and a franchisor's supply to a franchisee use the exact same mechanism.           | Multi-store/chain and Franchise directly; harmless/unused for the others                   |

Everything else — brand labels, product/supplier flexibility, invoice type — is a property
on top of these six, not a new tenancy shape.

**What actually distinguishes Chain from Franchise is not the stock flow — both move
goods from a central point to stores the same way.** It's the money relationship layered
on top: a chain's stores belong to one financial entity, so a stock transfer is just an
internal movement with no payment attached. A franchise's stores are a _separate_
financial entity from the franchisor, so the same transfer also implies a monthly
settlement — a revenue share and/or royalty owed back. That settlement calculation is new
work Chain never needs; see §5.

---

## 2. Phase plan

**Phase 1 (build now):**

- The full shared core above — `organizations`, `stores`, `members`, `memberships`,
  `access_grants`, `channels`, `stock_locations`/`stock_transfers`.
- Complete, working features for **Independent**, **Multi-store/chain**, and
  **Franchise** — three real near-term cases (Nellore/Tirupati as independent, Bandrip
  as franchise).
- Franchise specifically needs, beyond the shared core: a franchise-group table linking
  a franchisor `organization` to franchisee `organizations`, the franchisor-facing
  read-only dashboard (built on `access_grants`, no new access-control engineering), a
  "goods received from franchisor" stock-in flow instead of Purchase-Trip (§2.IV already
  notes Purchase-Trip doesn't fit this model), and the settlement engine in §5.
- **EBO** (company-owned variant), **MBO**, and **Boutique** ride along for free:
  EBO-COCO is just an `organizations` with >1 `store` (already Multi-store/chain) plus a
  brand label; EBO-FOFO rides on the Franchise work now also in Phase 1; MBO and Boutique
  are product-catalog flexibility in M3 (a `brand`/`supplier_id` field, no forced
  barcode/variant-matrix), not tenancy.

**Phase 2 (only if a real wholesale customer is in front of you):**

- **Wholesale/distributor**: new invoice type in M5 — credit terms, due dates, buyer
  GSTIN, bulk pricing. Isolated to billing; doesn't touch the tenancy core at all.

**Phase 3 (deferred until there's a deliberate decision to reopen §3's payment-gateway
non-goal):**

- **Omnichannel**: storefront, cart, online payment collection, fulfillment,
  cross-channel stock reservation. The `channels` entity from Phase 1 gives this a home
  to land in, but the actual build — especially payment handling — is real, separate
  engineering that shouldn't start without that constitution conversation happening first.

---

## 3. Per-model summary

| #   | Model                 | Phase                  | Shared core covers it?                       | Bespoke work still needed                                                                    |
| --- | --------------------- | ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Independent           | 1                      | Yes                                          | — (base case)                                                                                |
| 2   | Multi-store/chain     | 1                      | Yes                                          | Cross-store dashboard/reporting UI (M6+); `stock_transfers` for internal godown distribution |
| 3   | Franchise             | 1 (moved up — Bandrip) | Yes, via `access_grants` + `stock_transfers` | Franchise-group table, franchisor dashboard UI, **settlement engine (§5, new money logic)**  |
| 4   | EBO                   | 1 (both COCO and FOFO) | Yes                                          | Just a brand-label field                                                                     |
| 5   | MBO                   | 1                      | Yes, via product schema                      | Confirm once M3 is drafted                                                                   |
| 6   | Wholesale/distributor | 2                      | Tenancy: yes. Billing: no                    | New invoice type + GST logic in M5                                                           |
| 7   | Boutique              | 1                      | Yes, via product schema                      | Confirm once M3 is drafted                                                                   |
| 8   | Omnichannel           | 3                      | Partial, via `channels`                      | Storefront + payments + fulfillment; needs constitution amendment first                      |

---

## 4. Documentation status

- ✅ `M1-core-tenancy-schema.md` — the `organizations`/`memberships`/`access_grants`/`channels`/`stock_locations` schema
- ✅ `M1-franchise-model.md` — franchise-group design on `access_grants`, the goods-received-from-franchisor flow, and the settlement engine from §5
- ✅ `M1-schema-reference.md` — all 14 M1 tables consolidated with full columns (closed the gap where the PIN/device-enrollment design existed only in conversation)
- ✅ `M1-task-plan.md` — five sub-phases (M1a–M1e), ~102h, now reflected in `constitution.md`'s revised 404h total
- ⬜ `M5-wholesale-billing.md` — the new invoice type and GST handling (Phase 2 prep, not started — no real wholesale customer yet)
- ⬜ `M-omnichannel-explainer.md` — what Omnichannel would require, explicitly gated on a constitution amendment reopening the payment-gateway non-goal (Phase 3, informational only, not started)

---

## 5. Franchise settlement engine — worked example (Bandrip)

This is new money logic, not covered by anything designed so far, and per Constitution
§2.V it needs the same rigor as `gstCalc.ts`/`landedCost.ts`: a precise spec, unit tests,
no shortcuts.

**Confirmed formula (corrected 2026-08-21 — royalty is on the remainder, not gross):**

- Bandrip takes 50% of a store's monthly revenue, unconditionally, for stock replacement.
- If monthly revenue exceeds ₹3,00,000, Bandrip additionally takes 13% royalty —
  calculated on what's **left after the 50% stock share is removed**, not on gross
  revenue. Since the stock share is exactly half, this works out to 6.5% of gross
  revenue whenever it applies (0.13 × 0.5R = 0.065R) — smaller than the earlier
  gross-independent reading, but still a **cliff on the whole month**, not a slab on just
  the excess above ₹3L.
- Store-level operating costs (staff salaries, power, cleaning, government/compliance
  costs) are the store owner's own expenses, paid separately, and are not part of this
  split at all.

**Worked example, showing the cliff effect:**

| Monthly revenue | Stock share (50%) | Remainder    | Royalty (13% of remainder, only if R > ₹3L) | Total to Bandrip | Store keeps  | Store's % |
| --------------- | ----------------- | ------------ | ------------------------------------------- | ---------------- | ------------ | --------- |
| ₹2,50,000       | ₹1,25,000         | ₹1,25,000    | ₹0                                          | ₹1,25,000        | ₹1,25,000    | 50%       |
| ₹3,00,000       | ₹1,50,000         | ₹1,50,000    | ₹0                                          | ₹1,50,000        | ₹1,50,000    | 50%       |
| ₹3,00,001       | ₹1,50,000.50      | ₹1,50,000.50 | ₹19,500.07                                  | ₹1,69,500.57     | ₹1,30,500.43 | 43.5%     |
| ₹3,50,000       | ₹1,75,000         | ₹1,75,000    | ₹22,750                                     | ₹1,97,750        | ₹1,52,250    | 43.5%     |

The notch is smaller than the earlier (incorrect) gross-independent reading, but it's
still real: crossing ₹3,00,000 by a single rupee drops the store's share of revenue from
50% straight to 43.5% for the whole month, not gradually. This isn't necessarily wrong —
India's own GST apparel slab has the same shape, a discount that drops a piece below
₹2,500 flips the _whole_ piece from 18% to 5%, exactly as `gstCalc.ts` already models
deliberately — but it's worth a direct check against the actual signed Bandrip agreement,
along with one boundary detail: does "crosses ₹3L" mean strictly above ₹3,00,000, or
does exactly ₹3,00,000 already count?

**Open questions to resolve before implementation:**

1. Confirm the cliff structure and the exact ₹3,00,000 boundary against the real
   agreement (`>` vs `>=`).
2. What "monthly revenue" means precisely — gross sales including GST, or taxable value
   before GST? (Affects both the 50% share and the royalty, and should be nailed down the
   same way the GST threshold's per-piece basis was.)
3. Settlement cadence and rounding rule (whole rupees? paise, per the existing
   integer-paise convention in `src/lib`?).
4. Does the split apply per-store, or does Bandrip aggregate across every store it
   franchises before applying the ₹3L threshold? (Matters once there's more than one
   Bandrip-model store.)
