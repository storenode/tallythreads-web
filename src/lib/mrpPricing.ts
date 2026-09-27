// MRP pricing engine (Inventory Phase 2B, specs/roadmap/inventory.md §6). Pure, integer paise,
// no I/O — money logic, so it is golden-tested (constitution §2.V).
//
//   suggestMrpPaise  landed unit cost × (1 + invoice margin)   → purchaseMargin.ts (tested)
//   roundMrpPaise    Indian price points, ALWAYS UP (never lose margin)
//   gstInMrp         GST contained in a tax-INCLUSIVE MRP (apparel slab)
//   lotForecast      revenue / landed / GST / margin for a lot of items
//
// GST slab for a tax-inclusive MRP. Apparel GST is decided on the value EXCLUDING tax
// (≤ ₹2,500 per piece → 5%, above → 18%; gstCalc.ts). An MRP includes the tax, so the MRP
// boundary is ₹2,500 × 1.05 = ₹2,625: MRP ≤ ₹2,625.00 → 5%, above → 18% — the usual retail
// reading (as with the earlier ₹1,000 / ₹1,050 rule). To confirm with the CA before billing (M5).

import { GST_THRESHOLD_PAISE } from "./gstCalc";
import { suggestedMrpPaise, type MarginConfig } from "./purchaseMargin";

export type MrpRounding = "none" | "end99" | "end49or99" | "up10";

export const MRP_ROUNDING_OPTIONS: { value: MrpRounding; label: string }[] = [
  { value: "none", label: "No rounding" },
  { value: "end99", label: "Ends in 99 (₹1,299)" },
  { value: "end49or99", label: "Ends in 49 or 99 (₹1,249 / ₹1,299)" },
  { value: "up10", label: "Up to the next ₹10" },
];

/** Highest tax-inclusive MRP that still falls in the 5% slab: ₹2,625.00. */
export const MRP_5_PERCENT_MAX_PAISE = (GST_THRESHOLD_PAISE * 105) / 100;

function assertPaise(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0)
    throw new RangeError(`${name} must be a non-negative integer (paise)`);
}

/**
 * Round an MRP UP to an Indian price point (whole rupees). Never rounds down, so the margin
 * is never lost. A value already on a price point stays as it is.
 *   end99      ₹1,260 → ₹1,299 · ₹1,299 → ₹1,299 · ₹1,300 → ₹1,399
 *   end49or99  ₹1,210 → ₹1,249 · ₹1,260 → ₹1,299
 *   up10       ₹1,261 → ₹1,270 · ₹1,270 → ₹1,270
 */
export function roundMrpPaise(mrpPaise: number, mode: MrpRounding): number {
  assertPaise("mrpPaise", mrpPaise);
  if (mode === "none") return mrpPaise;
  const rupees = Math.ceil(mrpPaise / 100); // any paise pushes to the next rupee
  let r: number;
  switch (mode) {
    case "end99":
      r = Math.ceil((rupees + 1) / 100) * 100 - 1;
      break;
    case "end49or99":
      r = Math.ceil((rupees + 1) / 50) * 50 - 1;
      break;
    case "up10":
      r = Math.ceil(rupees / 10) * 10;
      break;
    default: {
      const _never: never = mode;
      throw new RangeError(`unknown rounding mode: ${String(_never)}`);
    }
  }
  return r * 100;
}

/** Suggested MRP: landed × (1 + margin from the invoice's config), then optional rounding. */
export function suggestMrpPaise(input: {
  landedUnitCostPaise: number;
  isTrending: boolean;
  margin: MarginConfig;
  rounding?: MrpRounding;
}): number {
  const raw = suggestedMrpPaise(
    { landedUnitCostPaise: input.landedUnitCostPaise, isTrending: input.isTrending },
    input.margin,
  );
  return roundMrpPaise(raw, input.rounding ?? "none");
}

/** GST contained in ONE tax-inclusive MRP (per piece). */
export function gstInMrp(mrpPaise: number): {
  ratePercent: 5 | 18;
  taxablePaise: number;
  gstPaise: number;
} {
  assertPaise("mrpPaise", mrpPaise);
  const ratePercent: 5 | 18 = mrpPaise <= MRP_5_PERCENT_MAX_PAISE ? 5 : 18;
  const taxablePaise = Math.round((mrpPaise * 100) / (100 + ratePercent));
  return { ratePercent, taxablePaise, gstPaise: mrpPaise - taxablePaise };
}

export interface ForecastLine {
  quantity: number;
  mrpPaise: number;
  landedUnitCostPaise: number;
}

export interface LotForecast {
  pieces: number;
  /** Σ qty × MRP — what customers pay (GST included). */
  revenuePaise: number;
  /** Σ qty × GST inside the MRP — collected for the government, not income. */
  gstPaise: number;
  /** Σ qty × landed cost. */
  landedPaise: number;
  /** revenue − GST − landed. */
  marginPaise: number;
  /** margin ÷ (revenue − GST); null when there is no net revenue. */
  marginPct: number | null;
  /** Lines whose MRP falls in the 18% slab (> ₹2,625). */
  lines18Percent: number;
}

/** Lot-level forecast for the catalogue screen — net of GST (MRP includes GST). */
export function lotForecast(lines: ForecastLine[]): LotForecast {
  let pieces = 0,
    revenuePaise = 0,
    gstPaise = 0,
    landedPaise = 0,
    lines18Percent = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0)
      throw new RangeError("quantity must be a positive integer");
    assertPaise("landedUnitCostPaise", l.landedUnitCostPaise);
    const g = gstInMrp(l.mrpPaise);
    pieces += l.quantity;
    revenuePaise += l.quantity * l.mrpPaise;
    gstPaise += l.quantity * g.gstPaise;
    landedPaise += l.quantity * l.landedUnitCostPaise;
    if (g.ratePercent === 18) lines18Percent += 1;
  }
  const net = revenuePaise - gstPaise;
  const marginPaise = net - landedPaise;
  return {
    pieces,
    revenuePaise,
    gstPaise,
    landedPaise,
    marginPaise,
    marginPct: net > 0 ? marginPaise / net : null,
    lines18Percent,
  };
}
