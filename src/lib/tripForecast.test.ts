import { describe, expect, it } from "vitest";
import { forecastTrip } from "./tripForecast";

describe("forecastTrip", () => {
  it("projects investment, revenue and profit at the expected margin", () => {
    // budget ₹1,00,000 + expenses ₹10,000 @ 25% margin
    const r = forecastTrip({
      plannedBudgetPaise: 10_000_000,
      estimatedExpensesPaise: 1_000_000,
      expectedMarginPct: 0.25,
    });
    expect(r.plannedInvestmentPaise).toBe(11_000_000); // 1,10,000
    expect(r.projectedRevenuePaise).toBe(12_500_000); // budget × 1.25
    expect(r.projectedProfitPaise).toBe(1_500_000); // 15,000
    expect(r.projectedRoiPct).toBeCloseTo(1_500_000 / 11_000_000, 6);
  });

  it("flags a loss when expenses outweigh the margin", () => {
    // budget ₹50,000 @ 10% → margin earns ₹5,000, but expenses are ₹9,000
    const r = forecastTrip({
      plannedBudgetPaise: 5_000_000,
      estimatedExpensesPaise: 900_000,
      expectedMarginPct: 0.1,
    });
    expect(r.projectedProfitPaise).toBe(-400_000); // 5,00,000 margin − 9,00,000 expenses
    expect(r.projectedRoiPct).toBeLessThan(0);
  });

  it("zero margin → revenue equals budget, profit is minus the expenses", () => {
    const r = forecastTrip({
      plannedBudgetPaise: 5_000_000,
      estimatedExpensesPaise: 300_000,
      expectedMarginPct: 0,
    });
    expect(r.projectedRevenuePaise).toBe(5_000_000);
    expect(r.projectedProfitPaise).toBe(-300_000);
  });

  it("zero investment → ROI is 0, not NaN", () => {
    const r = forecastTrip({
      plannedBudgetPaise: 0,
      estimatedExpensesPaise: 0,
      expectedMarginPct: 0.3,
    });
    expect(r.plannedInvestmentPaise).toBe(0);
    expect(r.projectedRoiPct).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() =>
      forecastTrip({ plannedBudgetPaise: -1, estimatedExpensesPaise: 0, expectedMarginPct: 0.2 }),
    ).toThrow(RangeError);
    expect(() =>
      forecastTrip({ plannedBudgetPaise: 100, estimatedExpensesPaise: 0, expectedMarginPct: -0.1 }),
    ).toThrow(RangeError);
  });
});
