import { describe, expect, it } from "vitest";
import { formatInr, paiseToRupeeInput, rupeesToPaise, formatPct } from "./money";

describe("money helpers", () => {
  it("formats paise as Indian-locale rupees", () => {
    expect(formatInr(123_456)).toBe("₹1,234.56");
    expect(formatInr(0)).toBe("₹0.00");
    expect(formatInr(-40_000)).toBe("-₹400.00");
    expect(formatInr(100_00_000)).toBe("₹1,00,000.00");
  });

  it("round-trips rupee input ↔ paise", () => {
    expect(rupeesToPaise("1234.56")).toBe(123_456);
    expect(rupeesToPaise(" 200 ")).toBe(20_000);
    expect(paiseToRupeeInput(123_456)).toBe("1234.56");
    expect(paiseToRupeeInput(null)).toBe("");
  });

  it("rejects empty / invalid / negative rupee input as null", () => {
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
  });

  it("formats a fraction as a percent", () => {
    expect(formatPct(0.6)).toBe("60%");
    expect(formatPct(0.2)).toBe("20%");
  });
});
