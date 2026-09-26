import { clientFor } from "./support/api";
import { expect, test } from "./support/fixtures";

// Happy path 3 — Purchase-Trip (M4), the core differentiator, as the org owner:
// plan → start → manual invoice + line item → trip expense → landed cost / MRP → complete.
//
// Money check (constitution §2.V, same numbers as the unit-tested engines):
//   goods   10 pcs × ₹1,000          = ₹10,000.00
//   expense travel                   =    ₹500.00  (all of it lands on the one line)
//   landed  total                    = ₹10,500.00  → ₹1,050.00 / unit
//   MRP     flat 20% (form default)  = ₹1,050 × 1.2 = ₹1,260.00

test("owner plans, runs and completes a purchase trip with correct landed cost", async ({
  ownerPage: page,
  env,
  ownerSession,
  demoOrg,
  tag,
}) => {
  const title = `E2E Surat trip ${tag}`;
  const supplier = `E2E Silk Mills ${tag}`;

  // --- Plan -------------------------------------------------------------------------
  await page.goto(`/org/${demoOrg.id}/purchase-trips`);
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Trip title").fill(title);
  await page.getByLabel("Planned budget (goods)").fill("20000");
  await page.getByLabel("Expected margin").fill("20");
  await page.getByRole("button", { name: "Create trip" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Status: planning")).toBeVisible();

  // --- Start ------------------------------------------------------------------------
  await page.getByRole("button", { name: "Start trip" }).click();
  await expect(page.getByText("Status: active")).toBeVisible();

  // --- Manual supplier invoice + one line item -------------------------------------
  await page.getByRole("tab", { name: "Invoices" }).click();
  await page.getByRole("button", { name: "Manual invoice" }).click();
  await page.getByLabel("Supplier").fill(supplier);
  await page.getByRole("button", { name: "Add invoice" }).click();
  await expect(page.getByText(supplier).first()).toBeVisible();

  await page.getByRole("button", { name: "+ Add item" }).click();
  // The editor renders a stacked card (< 640px) and a table (≥ 640px) bound to the same
  // form fields — target whichever copy is visible at this viewport.
  await page.locator('input[name="items.0.description"]:visible').fill("Cotton saree");
  await page.locator('input[name="items.0.quantity"]:visible').fill("10");
  const unitCost = page.locator('input[name="items.0.unitCostRupees"]:visible');
  await unitCost.fill("1000");
  await unitCost.blur(); // rows autosave to Dexie on blur

  // --- Trip expense ------------------------------------------------------------------
  await page.getByRole("tab", { name: "Expenses" }).click();
  await page.getByLabel("Amount").fill("500");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("₹500.00").first()).toBeVisible();

  // --- Landed cost + MRP -------------------------------------------------------------
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect(page.getByText("₹10,000.00").first()).toBeVisible(); // Goods
  await expect(page.getByText("₹10,500.00").first()).toBeVisible(); // Landed total

  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page.getByText("₹1,050.00").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("₹1,260.00").filter({ visible: true }).first()).toBeVisible();

  // --- Complete ----------------------------------------------------------------------
  await page.getByRole("button", { name: "Complete trip" }).click();
  await expect(page.getByText("Status: completed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clone trip" })).toBeVisible();

  // --- Synced to Supabase (offline-first: Dexie → outbox → push) ----------------------
  const db = clientFor(env, ownerSession.jwt);
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from("purchase_trips")
          .select(
            "status, trip_expenses(amount_paise), purchase_invoices(supplier_name, purchase_invoice_items(quantity, unit_cost_paise))",
          )
          .eq("organization_id", demoOrg.id)
          .eq("title", title)
          .is("deleted_at", null);
        return data?.[0] ?? null;
      },
      { message: "the completed trip should sync to Supabase", timeout: 90_000 },
    )
    .toMatchObject({
      status: "completed",
      trip_expenses: [{ amount_paise: 50_000 }],
      purchase_invoices: [
        {
          supplier_name: supplier,
          purchase_invoice_items: [{ quantity: 10, unit_cost_paise: 100_000 }],
        },
      ],
    });
});
