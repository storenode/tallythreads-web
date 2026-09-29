import { describe, expect, it } from "vitest";
import { locationFromScan, locationQrValue, suggestPlaces } from "./putAway";

const ID = "344792f0-d5f2-4656-9096-5e0b38534fe5";

describe("rack QR labels", () => {
  it("round-trips a location id", () => {
    expect(locationFromScan(locationQrValue(ID))).toBe(ID);
  });
  it("tolerates case and spaces from scanners", () => {
    expect(locationFromScan(`  ttloc:${ID.toUpperCase()} `)).toBe(ID);
  });
  it("is not confused with item SKUs or links", () => {
    expect(locationFromScan("BND-KDP-ACC-FREE-FREE-0001")).toBeNull();
    expect(locationFromScan("https://app.example/s/BND-KDP-ACC-FREE-FREE-0001")).toBeNull();
    expect(locationFromScan("TTLOC:not-a-uuid")).toBeNull();
  });
});

describe("suggestPlaces", () => {
  const categories = [
    { id: "cat-acc", code: "ACC" },
    { id: "cat-str", code: "STR" },
    { id: undefined, code: "NEW" }, // not synced yet
  ];
  const display = [
    { id: "3", code: "The bandits", categoryId: "cat-acc" },
    { id: "1", code: "Bottoms rack", categoryId: "cat-str" },
    { id: "2", code: "Front table", categoryId: null },
    { id: "4", code: "Accessories wall", categoryId: "cat-acc" },
  ];

  it("returns the display places tagged with the item's category, sorted by code", () => {
    expect(suggestPlaces("ACC", categories, display).map((p) => p.code)).toEqual([
      "Accessories wall",
      "The bandits",
    ]);
  });
  it("is empty when the store has no such category or nothing is tagged", () => {
    expect(suggestPlaces("KID", categories, display)).toEqual([]);
    expect(suggestPlaces("NEW", categories, display)).toEqual([]);
    expect(suggestPlaces("ACC", categories, [{ id: "2", code: "Front table", categoryId: null }])).toEqual([]);
  });
});
