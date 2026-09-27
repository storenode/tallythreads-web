import { describe, expect, it } from "vitest";
import {
  MRP_5_PERCENT_MAX_PAISE,
  gstInMrp,
  lotForecast,
  roundMrpPaise,
  suggestMrpPaise,
} from "./mrpPricing";

const rs = (r: number) => Math.round(r * 100);

describe("roundMrpPaise — always UP to an Indian price point", () => {
  it("none keeps the exact paise", () => {
    expect(roundMrpPaise(126_055, "none")).toBe(126_055);
  });

  it("end99", () => {
    expect(roundMrpPaise(rs(1260), "end99")).toBe(rs(1299));
    expect(roundMrpPaise(rs(1299), "end99")).toBe(rs(1299)); // already on a point
    expect(roundMrpPaise(rs(1300), "end99")).toBe(rs(1399));
    expect(roundMrpPaise(rs(1299.01), "end99")).toBe(rs(1399)); // paise push past 1,299
    expect(roundMrpPaise(rs(99), "end99")).toBe(rs(99));
    expect(roundMrpPaise(rs(12), "end99")).toBe(rs(99));
  });

  it("end49or99", () => {
    expect(roundMrpPaise(rs(1210), "end49or99")).toBe(rs(1249));
    expect(roundMrpPaise(rs(1249), "end49or99")).toBe(rs(1249));
    expect(roundMrpPaise(rs(1250), "end49or99")).toBe(rs(1299));
    expect(roundMrpPaise(rs(1260), "end49or99")).toBe(rs(1299));
  });

  it("up10", () => {
    expect(roundMrpPaise(rs(1261), "up10")).toBe(rs(1270));
    expect(roundMrpPaise(rs(1270), "up10")).toBe(rs(1270));
    expect(roundMrpPaise(rs(1260.5), "up10")).toBe(rs(1270));
  });

  it("never rounds down", () => {
    for (const mode of ["end99", "end49or99", "up10"] as const) {
      for (let p = 1; p < 500_000; p += 3_771) {
        expect(roundMrpPaise(p, mode)).toBeGreaterThanOrEqual(p);
      }
    }
  });

  it("rejects non-integer paise", () => {
    expect(() => roundMrpPaise(1.5, "end99")).toThrow(RangeError);
    expect(() => roundMrpPaise(-1, "none")).toThrow(RangeError);
  });
});

describe("suggestMrpPaise — landed × (1 + margin), then rounding", () => {
  it("matches the Purchase-Trip golden case: ₹1,050 landed, flat 20% → ₹1,260", () => {
    const margin = { recipe: { type: "flat" as const, pct: 0.2 } };
    expect(suggestMrpPaise({ landedUnitCostPaise: rs(1050), isTrending: false, margin })).toBe(
      rs(1260),
    );
    expect(
      suggestMrpPaise({ landedUnitCostPaise: rs(1050), isTrending: false, margin, rounding: "end99" }),
    ).toBe(rs(1299));
  });

  it("uses the trending pct for trending items", () => {
    const margin = { recipe: { type: "trending" as const, basePct: 0.2, trendingPct: 0.6 } };
    expect(suggestMrpPaise({ landedUnitCostPaise: rs(1000), isTrending: true, margin })).toBe(
      rs(1600),
    );
  });
});

describe("gstInMrp — tax-inclusive MRP, apparel slab (₹2,500 excl. ⇒ ₹2,625 incl.)", () => {
  it("boundary: ₹2,625.00 is 5%, ₹2,625.01 is 18%", () => {
    expect(MRP_5_PERCENT_MAX_PAISE).toBe(262_500);
    expect(gstInMrp(262_500)).toEqual({ ratePercent: 5, taxablePaise: 250_000, gstPaise: 12_500 });
    expect(gstInMrp(262_501).ratePercent).toBe(18);
  });

  it("extracts 5% from a ₹1,050 MRP → ₹1,000 + ₹50", () => {
    expect(gstInMrp(rs(1050))).toEqual({ ratePercent: 5, taxablePaise: rs(1000), gstPaise: rs(50) });
  });

  it("extracts 18% from a ₹2,950 MRP → ₹2,500 + ₹450", () => {
    expect(gstInMrp(rs(2950))).toEqual({ ratePercent: 18, taxablePaise: rs(2500), gstPaise: rs(450) });
  });

  it("taxable + GST always reconciles to the MRP (no paise lost)", () => {
    for (let p = 0; p < 1_000_000; p += 1_237) {
      const g = gstInMrp(p);
      expect(g.taxablePaise + g.gstPaise).toBe(p);
    }
  });
});

describe("lotForecast — net of GST", () => {
  it("golden lot: 15 sarees @ ₹2,699 (landed ₹2,173.24) + 80 kurtis @ ₹499 (landed ₹313.91)", () => {
    const f = lotForecast([
      { quantity: 15, mrpPaise: rs(2699), landedUnitCostPaise: 217_324 },
      { quantity: 80, mrpPaise: rs(499), landedUnitCostPaise: 31_391 },
    ]);
    // Saree ₹2,699 > ₹2,625 → 18%: taxable round(269900 × 100/118) = 228729, GST 41171.
    // Kurti ₹499 → 5%: taxable round(49900 × 100/105) = 47524, GST 2376.
    expect(f.pieces).toBe(95);
    expect(f.revenuePaise).toBe(15 * 269_900 + 80 * 49_900); // 8,040,500
    expect(f.gstPaise).toBe(15 * 41_171 + 80 * 2_376); // 807,645
    expect(f.landedPaise).toBe(15 * 217_324 + 80 * 31_391); // 5,771,140
    expect(f.marginPaise).toBe(8_040_500 - 807_645 - 5_771_140); // 1,461,715
    expect(f.marginPct).toBeCloseTo(1_461_715 / (8_040_500 - 807_645), 10);
    expect(f.lines18Percent).toBe(1);
  });

  it("empty lot", () => {
    expect(lotForecast([])).toEqual({
      pieces: 0,
      revenuePaise: 0,
      gstPaise: 0,
      landedPaise: 0,
      marginPaise: 0,
      marginPct: null,
      lines18Percent: 0,
    });
  });

  it("rejects bad quantities", () => {
    expect(() => lotForecast([{ quantity: 0, mrpPaise: 100, landedUnitCostPaise: 50 }])).toThrow(
      RangeError,
    );
  });
});
