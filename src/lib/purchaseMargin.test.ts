import { describe, expect, it } from "vitest";
import { resolveMarginPct, suggestedMrpPaise } from "./purchaseMargin";

// Landed unit costs carried over from the landed-cost demo (spec §13).
const STAPLE = { landedUnitCostPaise: 23_462, isTrending: false }; // ₹234.62
const TRENDING = { landedUnitCostPaise: 93_846, isTrending: true }; // ₹938.46

describe("purchaseMargin — flat recipe", () => {
  it("applies a flat margin to every item", () => {
    const cfg = { recipe: { type: "flat", pct: 0.2 } as const };
    expect(resolveMarginPct(STAPLE, cfg)).toBe(0.2);
    expect(suggestedMrpPaise(STAPLE, cfg)).toBe(28_154); // round(23462 × 1.2)
  });
});

describe("purchaseMargin — trending recipe", () => {
  const cfg = { recipe: { type: "trending", basePct: 0.2, trendingPct: 0.6 } as const };

  it("boosts trending items and keeps staples at base", () => {
    expect(resolveMarginPct(TRENDING, cfg)).toBe(0.6);
    expect(resolveMarginPct(STAPLE, cfg)).toBe(0.2);
    expect(suggestedMrpPaise(TRENDING, cfg)).toBe(150_154); // round(93846 × 1.6)
    expect(suggestedMrpPaise(STAPLE, cfg)).toBe(28_154); // round(23462 × 1.2)
  });
});

describe("purchaseMargin — coded plugin (whitelist)", () => {
  const cfg = { pluginId: "tiered-band-v1" };

  it("resolves margin through the registered plugin", () => {
    expect(resolveMarginPct(TRENDING, cfg)).toBe(0.5); // > ₹500 landed → 0.5
    expect(resolveMarginPct(STAPLE, cfg)).toBe(0.25); // ≤ ₹500 landed → 0.25
    expect(suggestedMrpPaise(TRENDING, cfg)).toBe(140_769); // round(93846 × 1.5)
  });

  it("throws on an unregistered pluginId (never eval'd)", () => {
    expect(() => resolveMarginPct(STAPLE, { pluginId: "does-not-exist" })).toThrow(
      RangeError,
    );
  });
});

describe("purchaseMargin — config validation", () => {
  it("requires exactly one of recipe or pluginId", () => {
    expect(() => resolveMarginPct(STAPLE, {})).toThrow(RangeError);
    expect(() =>
      resolveMarginPct(STAPLE, {
        recipe: { type: "flat", pct: 0.2 },
        pluginId: "tiered-band-v1",
      }),
    ).toThrow(RangeError);
  });

  it("rejects a negative margin and a negative landed cost", () => {
    expect(() =>
      resolveMarginPct(STAPLE, { recipe: { type: "flat", pct: -0.1 } }),
    ).toThrow(RangeError);
    expect(() =>
      suggestedMrpPaise(
        { landedUnitCostPaise: -1, isTrending: false },
        { recipe: { type: "flat", pct: 0.2 } },
      ),
    ).toThrow(RangeError);
  });
});
