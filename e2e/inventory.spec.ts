import { expect, test } from "./support/fixtures";

// Inventory entry points (specs/roadmap/inventory.md §2): the org console has an
// "Inventory" menu item for org roles (inventory.manage) that opens the org Inventory page
// (Ready for inventory · Categories). Dispatch lives on each invoice's Catalogue (Phase 2G) —
// the full flow is e2e/stock-flow.spec.ts.

test("org owner reaches Inventory from the left menu", async ({ ownerPage: page, demoOrg }) => {
  await page.goto(`/org/${demoOrg.id}`);
  // On phones the sidebar sits behind the menu button.
  const menuButton = page.getByRole("button", { name: "Open menu" });
  if (await menuButton.isVisible()) await menuButton.click();
  await page.getByRole("link", { name: "Inventory" }).click();

  await expect(page).toHaveURL(new RegExp(`/org/${demoOrg.id}/inventory$`));
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ready for inventory" })).toBeVisible();
  // A fresh org has nothing waiting — the empty state points at Deliveries.
  await expect(page.getByText("Nothing is waiting.")).toBeVisible();

  // The Stock & dispatch tab was retired (2026-09-28).
  await expect(page.getByRole("tab", { name: "Stock & dispatch" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Categories" }).click();
  await expect(page.getByText("No categories yet.")).toBeVisible();
});
