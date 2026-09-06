// Purchase-Trip landed-cost engine (M4). Pure, integer-paise, no I/O — so it runs
// offline and is fully unit-testable (constitution §2.V money-logic discipline).
// Design: specs/roadmap/purchase-trips.md §6.
//
// Distributes a trip's total expenses (travel/lodging/food/transport) across every item
// bought on the trip, giving each item its true landed cost. Default basis is "value"
// (a costlier line absorbs more overhead); "quantity" splits evenly per unit.

export type LandedCostBasis = "value" | "quantity";

export interface LandedCostItemInput {
  id: string;
  quantity: number;
  unitCostPaise: number;
}

export interface LandedCostItemResult {
  id: string;
  quantity: number;
  unitCostPaise: number;
  /** This item's allocated share of the trip's total expenses (whole line). */
  expenseSharePaise: number;
  /** goods (quantity × unitCost) + expenseShare for the line. */
  landedLineTotalPaise: number;
  /** Rounded per-unit landed cost — the basis for suggested MRP. */
  landedUnitCostPaise: number;
}

export interface LandedCostResult {
  items: LandedCostItemResult[];
  totalGoodsPaise: number;
  totalExpensesPaise: number;
  basis: LandedCostBasis;
}

function assertItem(item: LandedCostItemInput): void {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0)
    throw new RangeError(`quantity must be a positive integer (item ${item.id})`);
  if (!Number.isInteger(item.unitCostPaise) || item.unitCostPaise < 0)
    throw new RangeError(
      `unitCostPaise must be a non-negative integer paise (item ${item.id})`,
    );
}

/**
 * Compute landed cost for every item on a trip.
 *
 * Expenses are distributed by the largest-remainder method so the allocated shares sum
 * back to `totalExpensesPaise` EXACTLY (no paise lost or invented) — the same
 * reconciliation discipline gstCalc.ts uses. If the chosen basis produces zero total
 * weight (e.g. "value" basis but every unit cost is 0), it falls back to distributing
 * by quantity so expenses are still allocated.
 */
export function calculateLandedCost(
  items: LandedCostItemInput[],
  totalExpensesPaise: number,
  basis: LandedCostBasis = "value",
): LandedCostResult {
  if (!Number.isInteger(totalExpensesPaise) || totalExpensesPaise < 0)
    throw new RangeError("totalExpensesPaise must be a non-negative integer paise");
  items.forEach(assertItem);

  const totalGoodsPaise = items.reduce(
    (sum, it) => sum + it.quantity * it.unitCostPaise,
    0,
  );

  // Weight per item for the chosen basis; fall back to quantity if value-weight is 0.
  const weightOf = (it: LandedCostItemInput, b: LandedCostBasis): number =>
    b === "value" ? it.quantity * it.unitCostPaise : it.quantity;

  let effectiveBasis = basis;
  let totalWeight = items.reduce((s, it) => s + weightOf(it, basis), 0);
  if (totalWeight === 0 && items.length > 0) {
    effectiveBasis = "quantity";
    totalWeight = items.reduce((s, it) => s + weightOf(it, "quantity"), 0);
  }

  // Largest-remainder allocation (integer paise, deterministic tie-break by index).
  const shares = new Array<number>(items.length).fill(0);
  if (totalWeight > 0 && totalExpensesPaise > 0) {
    const remainders: Array<{ index: number; rem: number }> = [];
    let allocated = 0;
    items.forEach((it, i) => {
      const numerator = totalExpensesPaise * weightOf(it, effectiveBasis);
      const floorShare = Math.floor(numerator / totalWeight);
      shares[i] = floorShare;
      allocated += floorShare;
      remainders.push({ index: i, rem: numerator % totalWeight });
    });
    let leftover = totalExpensesPaise - allocated;
    // Give the leftover paise to the largest remainders first; ties → lower index.
    remainders.sort((a, b) => b.rem - a.rem || a.index - b.index);
    for (let k = 0; k < remainders.length && leftover > 0; k++) {
      shares[remainders[k].index] += 1;
      leftover--;
    }
  }

  const resultItems: LandedCostItemResult[] = items.map((it, i) => {
    const expenseSharePaise = shares[i];
    const landedLineTotalPaise = it.quantity * it.unitCostPaise + expenseSharePaise;
    return {
      id: it.id,
      quantity: it.quantity,
      unitCostPaise: it.unitCostPaise,
      expenseSharePaise,
      landedLineTotalPaise,
      landedUnitCostPaise: Math.round(landedLineTotalPaise / it.quantity),
    };
  });

  return {
    items: resultItems,
    totalGoodsPaise,
    totalExpensesPaise,
    basis: effectiveBasis,
  };
}
