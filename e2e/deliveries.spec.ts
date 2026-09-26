import { clientFor, seedCompletedTrip } from "./support/api";
import { expect, test } from "./support/fixtures";

// Happy path 4 — Deliveries (receiving) for a completed trip's parcel:
// Pending → In Transit → Received (inline, from the list) → check every item →
// Verified → Ready for Inventory (on the detail page).

test("owner receives a parcel through every stage to Ready for Inventory", async ({
  ownerPage: page,
  env,
  ownerSession,
  demoOrg,
  tag,
}) => {
  const parcel = await seedCompletedTrip(env, ownerSession, demoOrg.id, tag);
  const row = page.getByRole("link").filter({ hasText: parcel.supplierName });

  // The seeded rows reach the page through the app's sync pull (runs on load).
  await expect(async () => {
    await page.goto(`/org/${demoOrg.id}/deliveries`);
    await expect(row).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await expect(row.getByText("Pending")).toBeVisible();

  // --- Inline transport bumps (no data entry, the row doesn't navigate) ---------------
  await row.getByRole("button", { name: "🚚 Mark in transit" }).click();
  await expect(row.getByText("In Transit")).toBeVisible();
  await row.getByRole("button", { name: "📦 Mark received" }).click();
  await expect(row.getByText("Received")).toBeVisible();
  await expect(row.getByText("0/1 checked")).toBeVisible();

  // --- Detail page: forced line-level check gates Verify ------------------------------
  await row.click();
  await expect(page.getByRole("heading", { name: parcel.supplierName })).toBeVisible();
  const verify = page.getByRole("button", { name: "Verify Completed" });
  await expect(page.getByText("0 of 1 items checked")).toBeVisible();
  await expect(verify).toBeDisabled();

  const receivedQty = page.getByLabel("Received qty");
  await receivedQty.fill("10");
  await receivedQty.blur(); // saved to Dexie on blur
  await expect(page.getByText("1 of 1 items checked")).toBeVisible();
  await expect(verify).toBeEnabled();

  await verify.click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("✅ Ready for Inventory").first()).toBeVisible();

  // --- Synced to Supabase --------------------------------------------------------------
  const db = clientFor(env, ownerSession.jwt);
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from("purchase_invoices")
          .select("receiving_status, purchase_invoice_items(received_quantity)")
          .eq("id", parcel.invoiceId)
          .single();
        return data;
      },
      { message: "receiving should sync to Supabase", timeout: 90_000 },
    )
    .toMatchObject({
      receiving_status: "ready_for_inventory",
      purchase_invoice_items: [{ received_quantity: 10 }],
    });
});
