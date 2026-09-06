// Purchase-Trip pre-trip forecast engine (M4). Pure, integer-paise. A DECISION AID the
// owner sees before travelling — it is an ESTIMATE, never a guarantee, and the UI must
// label it so. Design: specs/roadmap/purchase-trips.md §8.
//
// NOTE: break-even / ROI-to-pocket (when the money actually returns) is deliberately NOT
// here — it needs a sell-through assumption now and real sales data (M5) to be accurate,
// so it is parked in specs/roadmap/backlog.md. This engine only projects investment vs.
// return at the expected margin.

export interface TripForecastInput {
  /** Planned spend on goods (cost). */
  plannedBudgetPaise: number;
  /** Planned trip expenses (travel/lodging/food/transport), manual or AI-estimated. */
  estimatedExpensesPaise: number;
  /** Expected blended margin as a fraction (0.35 = 35%). */
  expectedMarginPct: number;
}

export interface TripForecastResult {
  /** budget + expenses — total cash the owner commits. */
  plannedInvestmentPaise: number;
  /** budget × (1 + expected margin) — expected sales value of the goods. */
  projectedRevenuePaise: number;
  /** revenue − investment (can be negative if expenses outweigh the margin). */
  projectedProfitPaise: number;
  /** profit / investment as a fraction; 0 when investment is 0. Estimate only. */
  projectedRoiPct: number;
}

/**
 * Project a trip's investment and return from its plan. Estimate only — see the file
 * header. Profit can be negative, which is itself a useful pre-trip signal (expenses eat
 * more than the margin earns).
 */
export function forecastTrip(input: TripForecastInput): TripForecastResult {
  const { plannedBudgetPaise, estimatedExpensesPaise, expectedMarginPct } = input;

  if (!Number.isInteger(plannedBudgetPaise) || plannedBudgetPaise < 0)
    throw new RangeError("plannedBudgetPaise must be a non-negative integer paise");
  if (!Number.isInteger(estimatedExpensesPaise) || estimatedExpensesPaise < 0)
    throw new RangeError("estimatedExpensesPaise must be a non-negative integer paise");
  if (!Number.isFinite(expectedMarginPct) || expectedMarginPct < 0)
    throw new RangeError("expectedMarginPct must be a non-negative number");

  const plannedInvestmentPaise = plannedBudgetPaise + estimatedExpensesPaise;
  const projectedRevenuePaise = Math.round(plannedBudgetPaise * (1 + expectedMarginPct));
  const projectedProfitPaise = projectedRevenuePaise - plannedInvestmentPaise;
  const projectedRoiPct =
    plannedInvestmentPaise === 0 ? 0 : projectedProfitPaise / plannedInvestmentPaise;

  return {
    plannedInvestmentPaise,
    projectedRevenuePaise,
    projectedProfitPaise,
    projectedRoiPct,
  };
}
