import { describe, expect, it } from "vitest";
import {
  CODE_RE,
  STORE_CODE_RE,
  categoryCodeFor,
  normalizeCode,
  normalizeStoreCode,
  suggestOrgCode,
} from "./codes";

describe("normalizeCode", () => {
  it("uppercases and strips to A–Z/0–9, max 6", () => {
    expect(normalizeCode("b-nd 01!")).toBe("BND01");
    expect(normalizeCode("abcdefgh")).toBe("ABCDEF");
  });
});

describe("normalizeStoreCode", () => {
  it("keeps single hyphens between segments", () => {
    expect(normalizeStoreCode("bnd--kdp ")).toBe("BND-KDP");
    expect(STORE_CODE_RE.test("BND-KDP")).toBe(true);
    expect(STORE_CODE_RE.test("-KDP")).toBe(false);
    expect(STORE_CODE_RE.test("K")).toBe(false);
  });
});

describe("suggestOrgCode", () => {
  it("prefers the prefix every store code shares", () => {
    expect(suggestOrgCode("BANDRIP STREETWEAR STORE", ["BND-KDP", "bnd-nlr", "BND-TPT"])).toBe("BND");
  });

  it("falls back to initials when store prefixes differ or are missing", () => {
    expect(suggestOrgCode("Vasavi Cloth Store", ["VCS-PDT"])).toBe("VCS");
    expect(suggestOrgCode("Sri Lakshmi Textiles", ["SLT-PDT", "KDP-01"])).toBe("SLT");
    expect(suggestOrgCode("Sri Lakshmi Textiles")).toBe("SLT");
  });

  it("uses the first letters of a one-word name", () => {
    expect(suggestOrgCode("Bandrip")).toBe("BANDRI");
  });

  it("returns '' when nothing valid can be derived", () => {
    expect(suggestOrgCode("!")).toBe("");
    expect(CODE_RE.test(suggestOrgCode("Vasavi Cloth Store"))).toBe(true);
  });
});

describe("categoryCodeFor (mirrors the DB trigger)", () => {
  const org = [
    { name: "Sarees", code: "SAR" },
    { name: "Men's Wear", code: "MEN" },
  ];

  it("reuses the org's existing code for the same name (any case / spacing)", () => {
    expect(categoryCodeFor(" sarees ", org)).toBe("SAR");
  });

  it("takes the first 3 letters of a new name", () => {
    expect(categoryCodeFor("Kids Wear", org)).toBe("KID");
    expect(categoryCodeFor("Women's Wear", org)).toBe("WOM");
  });

  it("suffixes when a different name already uses the code", () => {
    expect(categoryCodeFor("Sari Falls", org)).toBe("SAR2");
    expect(categoryCodeFor("Sari Borders", [...org, { name: "Sari Falls", code: "SAR2" }])).toBe("SAR3");
  });

  it("pads very short names to 2 characters", () => {
    expect(categoryCodeFor("K", [])).toBe("KX");
  });
});
