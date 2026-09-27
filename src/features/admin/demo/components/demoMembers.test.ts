import { describe, expect, it, vi } from "vitest";

// The demo modules import the Supabase client; these tests only check static demo data.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

const { demoManagerFor } = await import("./demoMembers");
const { CHAIN_DEMO_DEFAULTS, newChainStore } = await import("./chain.demo");
const { FRANCHISE_DEMO_DEFAULTS, newFranchiseStore } = await import("./franchise.demo");

const staff = { fullName: "Kadapa Staff", email: "kadapa.staff@bandrip.example.in", mobileNumber: "+91 90000 10001" };

describe("demoManagerFor", () => {
  it("derives a distinct manager from the store's sales staff", () => {
    expect(demoManagerFor(staff)).toEqual({
      fullName: "Kadapa Manager",
      email: "kadapa.manager@bandrip.example.in",
      mobileNumber: "+91 90000 10006",
    });
  });

  it("handles emails and names without the .staff / Staff convention", () => {
    const m = demoManagerFor({ fullName: "Ravi", email: "ravi@shop.in", mobileNumber: "98765" });
    expect(m.email).toBe("ravi.manager@shop.in");
    expect(m.fullName).toBe("Ravi Manager");
  });
});

describe("demo defaults give every store a manager (Go-live gate)", () => {
  const cases = [
    ["chain", CHAIN_DEMO_DEFAULTS.owner.email, [...CHAIN_DEMO_DEFAULTS.stores, newChainStore()]],
    ["franchise", FRANCHISE_DEMO_DEFAULTS.owner.email, [...FRANCHISE_DEMO_DEFAULTS.stores, newFranchiseStore()]],
  ] as const;

  it.each(cases)("%s: manager emails are unique and differ from staff/owner", (_, ownerEmail, stores) => {
    const managers = stores.map((s) => s.manager?.email);
    expect(managers.every(Boolean)).toBe(true);
    const everyone = [ownerEmail, ...stores.map((s) => s.salesStaff.email), ...managers];
    expect(new Set(everyone).size).toBe(everyone.length);
  });
});
