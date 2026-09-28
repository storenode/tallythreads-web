import { describe, expect, it } from "vitest";
import { getOperationsNav } from "./nav";

describe("getOperationsNav", () => {
  it("is Billing, Inventory (incl. Incoming Stock), Agent, Reports, Settings — no Trips", () => {
    expect(getOperationsNav("s1").map((i) => [i.label, i.to])).toEqual([
      ["Billing", "/ops/s1/billing"],
      ["Inventory", "/ops/s1/inventory"],
      ["Agent", "/ops/s1/agent"],
      ["Reports", "/ops/s1/reports"],
      ["Settings", "/ops/s1/settings"],
    ]);
  });
});
