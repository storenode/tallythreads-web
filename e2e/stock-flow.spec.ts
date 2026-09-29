import { expect, test } from "./support/fixtures";
import { clientFor, seedCompletedTrip } from "./support/api";

// Stock from the org to a store shelf, end to end (specs/roadmap/inventory.md §7, §8, Phase 2G):
// Catalogue: add item → Dispatch (SKU created on first use) → courier shipment
// → Store: Incoming Stock → Receive into the stock room
// → Stock in hand: scan the packet → Move to the suggested rack (tagged with its category).
// The org owner does both sides (org-level inventory.manage / .write covers the store).

test("catalogue → dispatch by courier → receive → put away on the suggested rack", async ({
  ownerPage: page,
  demoOrg,
  ownerSession,
  env,
  tag,
}) => {
  test.slow(); // several server round-trips (finalize, dispatch, receive)
  const admin = clientFor(env, env.adminJwt);
  const orgId = demoOrg.id;
  const code = `E${tag.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase()}`.slice(0, 6);

  // ── seed: org code, one store with a Sarees category, a Sarees rack and a stock room ──
  const storeId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const rackId = crypto.randomUUID();
  const roomId = crypto.randomUUID();
  const must = (label: string, r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
  };
  must("org_code", await admin.from("organizations").update({ org_code: code }).eq("id", orgId));
  must(
    "store",
    await admin
      .from("stores")
      .insert({ id: storeId, organization_id: orgId, name: `E2E Store ${tag}`, store_code: `${code}-ST` }),
  );
  must(
    "category",
    await admin
      .from("inventory_categories")
      .insert({ id: categoryId, organization_id: orgId, store_id: storeId, name: "Sarees", code: "SAR" }),
  );
  must(
    "rack",
    await admin.from("stock_locations").insert({
      id: rackId,
      store_id: storeId,
      placement_type: "rack",
      code: "SAREE-RACK",
      category_id: categoryId,
    }),
  );
  must("room", await admin.from("warehouses").insert({ id: roomId, organization_id: orgId, name: "E2E Godown" }));
  must("room link", await admin.from("warehouse_stores").insert({ warehouse_id: roomId, store_id: storeId }));

  // A completed trip whose invoice reached Ready for Inventory (10 × "Cotton saree").
  const parcel = await seedCompletedTrip(env, ownerSession, orgId, tag);
  must(
    "ready",
    await admin.from("purchase_invoices").update({ receiving_status: "ready_for_inventory" }).eq("id", parcel.invoiceId),
  );
  must(
    "received qty",
    await admin.from("purchase_invoice_items").update({ received_quantity: 10 }).eq("invoice_id", parcel.invoiceId),
  );

  // ── org: Catalogue → add item → Dispatch ────────────────────────────────────────────
  await page.goto(`/org/${orgId}/inventory`);
  await page.getByRole("link", { name: /Catalogue/ }).first().click();
  await expect(page.getByText(parcel.supplierName)).toBeVisible();

  await page.getByRole("button", { name: /Add item/ }).filter({ visible: true }).first().click();
  // One store in the org → allocated automatically; "Cotton saree" → the Sarees category.
  const dispatch = page.getByRole("button", { name: "Dispatch 10" }).filter({ visible: true }).first();
  await expect(dispatch).toBeVisible({ timeout: 20_000 });
  await dispatch.click(); // creates the SKU, then opens the dispatch form in place of the table

  await expect(page.getByRole("button", { name: /Back to items/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Courier" }).click();
  await page.getByLabel("Courier company").fill("DTDC");
  await page.getByLabel("AWB / docket no.").fill(`AWB${tag}`);
  await page.getByRole("button", { name: /^Dispatch 10 pcs/ }).click();
  await expect(page.getByText(/Dispatched 10 pcs to/)).toBeVisible({ timeout: 30_000 });

  const { data: transfer } = await admin
    .from("stock_transfers")
    .select("id, status, transport_mode, carrier_name, tracking_no")
    .eq("organization_id", orgId)
    .single();
  expect(transfer).toMatchObject({
    status: "dispatched",
    transport_mode: "courier",
    carrier_name: "DTDC",
    tracking_no: `AWB${tag}`,
  });

  // ── store: Incoming Stock → Receive into the stock room ──────────────────────────────
  await page.goto(`/ops/${storeId}/inventory?tab=incoming`);
  await expect(page.getByText(/DTDC · AWB/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Receive" }).click();
  await page.getByRole("button", { name: "Everything arrived" }).click();
  await page.getByLabel("Put the parcel in").selectOption({ label: "E2E Godown" });
  await page.getByRole("button", { name: "Confirm 10 of 10 received" }).click();

  // Lands on Stock in hand, with the put-away hint.
  await expect(page.getByText(/10 pcs.*in the stock room or not placed yet/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Goes on: Display · SAREE-RACK")).toBeVisible();

  // ── put away: scan the packet → Move opens with the suggested rack ───────────────────
  const { data: item } = await admin
    .from("inventory_items")
    .select("sku")
    .eq("organization_id", orgId)
    .eq("status", "finalized")
    .single();
  const scan = page.getByLabel("Scan a label, or type a SKU or name");
  await scan.fill(item!.sku);
  await scan.press("Enter");
  await expect(page.getByText("Suggested: Display · SAREE-RACK")).toBeVisible();
  await page.getByRole("button", { name: "Move", exact: true }).click();

  // The move is offline-first (Dexie → outbox): wait until the server shows it on the rack.
  await expect
    .poll(
      async () => {
        const { data } = await admin.rpc("store_stock", { p_store_id: storeId });
        return (data as { location_code: string | null; quantity: number }[] | null)
          ?.filter((r) => r.location_code === "SAREE-RACK")
          .reduce((n, r) => n + r.quantity, 0);
      },
      { timeout: 30_000 },
    )
    .toBe(10);
});
