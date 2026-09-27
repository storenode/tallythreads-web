import { describe, expect, it } from "vitest";
import {
  LABEL_LAYOUTS,
  countLabels,
  customA4Layout,
  labelMrp,
  labelsPerPage,
  paginateLabels,
  type LabelData,
} from "./labels";

const tee: LabelData = { sku: "BND-KDP-STR-BLACK-XL-0001", name: "Tee", color: "Black", size: "XL", mrpPaise: 49900 };
const hoodie: LabelData = { sku: "BND-KDP-STR-GREY-M-0001", name: "Hoodie", color: "Grey", size: "M", mrpPaise: 129900 };
const layout = (id: string) => LABEL_LAYOUTS.find((l) => l.id === id)!;

describe("label layouts", () => {
  it("every preset grid fits its page", () => {
    for (const l of LABEL_LAYOUTS) {
      const w = l.marginLeft * 2 + l.cols * l.labelW + (l.cols - 1) * l.gapX;
      const h = l.marginTop * 2 + l.rows * l.labelH + (l.rows - 1) * l.gapY;
      expect(w).toBeLessThanOrEqual(l.pageW + 0.01);
      expect(h).toBeLessThanOrEqual(l.pageH + 0.01);
    }
  });

  it("custom A4 grid derives a label size that fits, clamped to sane bounds", () => {
    const l = customA4Layout(4, 10);
    expect(labelsPerPage(l)).toBe(40);
    expect(l.marginLeft * 2 + 4 * l.labelW + 3 * l.gapX).toBeLessThanOrEqual(210);
    expect(l.marginTop * 2 + 10 * l.labelH + 9 * l.gapY).toBeLessThanOrEqual(297);
    expect(customA4Layout(0, 99).cols).toBe(1);
    expect(customA4Layout(0, 99).rows).toBe(20);
  });
});

describe("paginateLabels", () => {
  it("thermal: one label per page, copies expanded", () => {
    const pages = paginateLabels([{ label: tee, copies: 3 }, { label: hoodie, copies: 1 }], layout("thermal-50x25"));
    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p[0]?.sku)).toEqual([tee.sku, tee.sku, tee.sku, hoodie.sku]);
  });

  it("thermal ignores start-at", () => {
    expect(paginateLabels([{ label: tee, copies: 1 }], layout("thermal-50x25"), 5)).toHaveLength(1);
  });

  it("A4 sheet: start at label N skips used stickers on the first page only", () => {
    const pages = paginateLabels([{ label: tee, copies: 30 }], layout("a4-24"), 20);
    expect(pages).toHaveLength(3); // 19 skipped + 30 = 49 cells → 24 + 24 + 1
    expect(pages[0].slice(0, 19).every((c) => c === null)).toBe(true);
    expect(pages[0][19]?.sku).toBe(tee.sku);
    expect(countLabels(pages)).toBe(30);
  });

  it("start-at is clamped to the sheet", () => {
    const pages = paginateLabels([{ label: tee, copies: 1 }], layout("a4-24"), 999);
    expect(pages[0].filter((c) => c === null)).toHaveLength(23);
  });

  it("nothing to print → no pages", () => {
    expect(paginateLabels([{ label: tee, copies: 0 }], layout("a4-65"), 10)).toEqual([]);
  });
});

describe("labelMrp", () => {
  it("formats whole rupees in Indian grouping", () => {
    expect(labelMrp(49900)).toBe("₹499");
    expect(labelMrp(12999900)).toBe("₹1,29,999");
    expect(labelMrp(49950)).toBe("₹499.50");
  });
});
