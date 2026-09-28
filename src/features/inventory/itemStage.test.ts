import { describe, expect, it } from "vitest";
import { editRule, itemStage } from "./itemStage";

describe("itemStage", () => {
  it("draft stays draft whatever else is true", () => {
    expect(itemStage({ status: "draft", labels_printed: 0 }, false)).toBe("draft");
  });
  it("finalized: barcoded until labels are printed, then printed", () => {
    expect(itemStage({ status: "finalized", labels_printed: 0 }, false)).toBe("barcoded");
    expect(itemStage({ status: "finalized", labels_printed: 25 }, false)).toBe("printed");
  });
  it("dispatch wins over printed", () => {
    expect(itemStage({ status: "finalized", labels_printed: 25 }, true)).toBe("dispatched");
    expect(itemStage({ status: "finalized", labels_printed: 0 }, true)).toBe("dispatched");
  });
});

describe("editRule", () => {
  it("draft: everything editable", () => {
    for (const f of ["name", "mrp", "store", "category", "color", "size", "quantity"] as const) {
      expect(editRule("draft", f)).toBe("edit");
    }
  });
  it("barcoded: name / MRP edit freely, SKU fields and qty reset the barcode", () => {
    expect(editRule("barcoded", "name")).toBe("edit");
    expect(editRule("barcoded", "mrp")).toBe("edit");
    for (const f of ["store", "category", "color", "size", "quantity"] as const) {
      expect(editRule("barcoded", f)).toBe("reset");
    }
  });
  it("printed and dispatched: everything locked", () => {
    for (const s of ["printed", "dispatched"] as const) {
      for (const f of ["name", "mrp", "store", "category", "color", "size", "quantity"] as const) {
        expect(editRule(s, f)).toBe("locked");
      }
    }
  });
});
