import { describe, expect, it, vi } from "vitest";

// The seeders import the Supabase client; these tests only check the static demo data.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

const { DEMO_CATEGORIES } = await import("./categories.demo");
const { demoPlacementFor } = await import("./demoPlacement");
type Node = ReturnType<typeof demoPlacementFor>[number];

function categoryHints(nodes: Node[]): string[] {
  return nodes.flatMap((n) => [
    ...(n.category ? [n.category] : []),
    ...categoryHints(n.children ?? []),
  ]);
}

describe("demo categories", () => {
  it.each(["independent", "chain", "franchise"] as const)(
    "every %s placement category hint is a seeded demo category",
    (orgType) => {
      const seeded = new Set(DEMO_CATEGORIES[orgType]);
      for (let i = 0; i < 3; i++) {
        for (const hint of categoryHints(demoPlacementFor(orgType, i))) {
          expect(seeded, `${orgType} store ${i}: "${hint}"`).toContain(hint);
        }
      }
    },
  );

  it("tags at least one placement node per org type", () => {
    for (const orgType of ["independent", "chain", "franchise"] as const) {
      expect(categoryHints(demoPlacementFor(orgType, 0)).length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate names within a type (unique per store in the DB)", () => {
    for (const names of Object.values(DEMO_CATEGORIES)) {
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
