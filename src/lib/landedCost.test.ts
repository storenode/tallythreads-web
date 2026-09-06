import { describe, expect, it } from "vitest";
import { calculateLandedCost, type LandedCostItemInput } from "./landedCost";

const STAPLE: LandedCostItemInput = { id: "staple", quantity: 100, unitCostPaise: 20_000 }; // ₹200
const TRENDING: LandedCostItemInput = { id: "trending", quantity: 40, unitCostPaise: 80_000 }; // ₹800

describe("calculateLandedCost", () => {
  it("distributes expenses by value — the demo Surat trip (spec §13)", () => {
    // Goods: staple line 20,00,000 + trending line 32,00,000 = 52,00,000 paise
    // Expenses: ₹9,000 = 9,00,000 paise
    const r = calculateLandedCost([STAPLE, TRENDING], 900_000, "value");

    const staple = r.items.find((i) => i.id === "staple")!;
    const trending = r.items.find((i) => i.id === "trending")!;

    expect(staple.expenseSharePaise).toBe(346_154);
    expect(trending.expenseSharePaise).toBe(553_846);
    // landed unit cost = (goods + share) / qty, rounded
    expect(staple.landedUnitCostPaise).toBe(23_462); // ₹234.62 (was ₹200)
    expect(trending.landedUnitCostPaise).toBe(93_846); // ₹938.46 (was ₹800)
    expect(r.totalGoodsPaise).toBe(5_200_000);
    expect(r.basis).toBe("value");
  });

  it("allocated shares always sum back exactly to total expenses (reconciliation)", () => {
    // A deliberately awkward set where naive rounding would drift.
    const items: LandedCostItemInput[] = [
      { id: "a", quantity: 3, unitCostPaise: 3_333 },
      { id: "b", quantity: 7, unitCostPaise: 111 },
      { id: "c", quantity: 1, unitCostPaise: 99_991 },
    ];
    for (const expenses of [1, 7, 100, 12_345, 900_001]) {
      const r = calculateLandedCost(items, expenses, "value");
      const sum = r.items.reduce((s, i) => s + i.expenseSharePaise, 0);
      expect(sum).toBe(expenses);
    }
  });

  it("gives all expenses to a single item", () => {
    const r = calculateLandedCost([STAPLE], 900_000, "value");
    expect(r.items[0].expenseSharePaise).toBe(900_000);
    expect(r.items[0].landedUnitCostPaise).toBe(29_000); // (20,00,000 + 9,00,000)/100
  });

  it("zero expenses → landed unit cost equals unit cost", () => {
    const r = calculateLandedCost([STAPLE, TRENDING], 0, "value");
    expect(r.items[0].expenseSharePaise).toBe(0);
    expect(r.items[0].landedUnitCostPaise).toBe(20_000);
    expect(r.items[1].landedUnitCostPaise).toBe(80_000);
  });

  it("distributes by quantity when basis is 'quantity'", () => {
    // qty 100 vs 40 → total 140; ₹1,400 = 1,40,000 paise → 1,000 paise/unit
    const r = calculateLandedCost([STAPLE, TRENDING], 140_000, "quantity");
    expect(r.items.find((i) => i.id === "staple")!.expenseSharePaise).toBe(100_000);
    expect(r.items.find((i) => i.id === "trending")!.expenseSharePaise).toBe(40_000);
    expect(r.basis).toBe("quantity");
  });

  it("falls back to quantity when value-weight is zero (all unit costs 0)", () => {
    const free: LandedCostItemInput[] = [
      { id: "x", quantity: 2, unitCostPaise: 0 },
      { id: "y", quantity: 3, unitCostPaise: 0 },
    ];
    const r = calculateLandedCost(free, 500, "value");
    expect(r.basis).toBe("quantity");
    expect(r.items.reduce((s, i) => s + i.expenseSharePaise, 0)).toBe(500);
  });

  it("rejects invalid input", () => {
    expect(() => calculateLandedCost([{ id: "a", quantity: 0, unitCostPaise: 1 }], 10)).toThrow(
      RangeError,
    );
    expect(() =>
      calculateLandedCost([{ id: "a", quantity: 1, unitCostPaise: -1 }], 10),
    ).toThrow(RangeError);
    expect(() => calculateLandedCost([STAPLE], -1)).toThrow(RangeError);
  });
});
