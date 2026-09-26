import { clientFor } from "./support/api";
import { expect, test } from "./support/fixtures";

// Happy path 2 — the Organization Setup Wizard, driven by the platform admin:
// Organization → Stores (+ inventory categories) → Stock setup → Members → Go live.
// The org is created with "Demo organization" ticked and hard-deleted afterwards.

test("admin sets up a new organization end to end and takes it live", async ({
  adminPage: page,
  env,
  tag,
  deleteOrgAfter,
}) => {
  const orgName = `E2E Wizard ${tag}`;
  const storeName = `E2E Store ${tag}`;
  const storeCode = `E2E-${tag.slice(-4).toUpperCase()}`;
  const ownerEmail = `e2e.wizard.${tag}@example.com`;
  const roomName = `E2E Godown ${tag}`;
  const customCategory = `E2E Bridal ${tag}`;
  const categories = ["Sarees", "Kids Wear", customCategory];

  // --- Step 1: Organization -------------------------------------------------------
  await page.goto("/admin/setup/new");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Registration type").selectOption("chain");
  await page.getByLabel("Demo organization").check();
  // Created as a trial so the Go-live step has something to flip.
  await page.getByLabel("Status", { exact: true }).selectOption("trial");
  await page.getByRole("button", { name: "Create & continue" }).click();

  await expect(page).toHaveURL(/\/admin\/setup\/[0-9a-f-]{36}\/stores/);
  const orgId = page.url().match(/\/admin\/setup\/([0-9a-f-]{36})\//)![1];
  deleteOrgAfter(orgId);

  // --- Step 2: Stores -------------------------------------------------------------
  await expect(page.getByText("No stores yet")).toBeVisible();
  await page.getByRole("button", { name: "Add store" }).click();
  await page.getByLabel("Store name").fill(storeName);
  await page.getByLabel("Store code").fill(storeCode);
  await page.getByRole("button", { name: "Add store" }).click();
  await expect(page.getByRole("button", { name: storeName })).toBeVisible();

  // Categories live on the store's edit form (they need a store id) and save with it.
  await page.getByRole("button", { name: storeName }).click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  await page.getByLabel("Sarees", { exact: true }).check();
  await page.getByLabel("Kids Wear", { exact: true }).check();
  await page.getByRole("button", { name: "+ Add category" }).click();
  // Enter adds the custom category (and must not submit the store form).
  await page.getByPlaceholder("New category (e.g. Wedding Collection)").fill(customCategory);
  await page.getByPlaceholder("New category (e.g. Wedding Collection)").press("Enter");
  await expect(page.getByLabel(customCategory, { exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Edit store" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Add every branch this organization runs.")).toBeVisible();

  // Reopening the store shows the saved selection (offline-first: read back from Dexie).
  await page.getByRole("button", { name: storeName }).click();
  for (const name of categories) {
    await expect(page.getByLabel(name, { exact: true })).toBeChecked();
  }
  await expect(page.getByLabel("Readymade", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Next: Stock setup →" }).click();

  // --- Step 3: Stock setup (an org-level stock room) ------------------------------
  await expect(page).toHaveURL(/\/stock-setup/);
  await page.getByRole("button", { name: "+ Add stock room" }).click();
  await page.getByLabel("Name", { exact: true }).fill(roomName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(roomName).first()).toBeVisible();

  await page.getByRole("button", { name: "Next: Members →" }).click();

  // --- Step 4: Members — org owner as primary contact, then owner manages the store --
  await expect(page).toHaveURL(/\/members/);
  await expect(page.getByText("No primary contact")).toBeVisible();
  await page.getByRole("tabpanel").getByRole("button", { name: "Add member" }).click();
  await page.getByLabel("Email", { exact: true }).fill(ownerEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("org_owner");
  await page.getByLabel("Make primary contact").check();
  await page.getByRole("button", { name: "Add member" }).click();

  await expect(page.getByText(ownerEmail).first()).toBeVisible();
  await expect(page.getByText("No primary contact")).toBeHidden();

  await page.getByRole("tab", { name: "Store members" }).click();
  await expect(page.getByText("No owner yet")).toBeVisible();
  await page.getByRole("button", { name: "Owner manages this store" }).click();
  await expect(page.getByRole("tabpanel").getByText("Owner set")).toBeVisible();

  await page.getByRole("button", { name: "Next: Go live →" }).click();

  // --- Step 5: Go live ------------------------------------------------------------
  await expect(page).toHaveURL(/\/go-live/);
  await expect(page.getByText("Before going live:")).toBeHidden();
  await expect(page.getByRole("cell", { name: storeName })).toBeVisible();
  await expect(page.getByText("Owner set")).toBeVisible();
  await page.getByRole("button", { name: "Go live", exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/organizations$/);

  // --- Server state: the org is live, a demo org, with its store --------------------
  const db = clientFor(env, env.adminJwt);
  const { data: org, error } = await db
    .from("organizations")
    .select("status, is_demo, primary_contact_member_id, stores(id, name, store_code)")
    .eq("id", orgId)
    .single();
  expect(error).toBeNull();
  expect(org).toMatchObject({
    status: "active",
    is_demo: true,
    stores: [{ name: storeName, store_code: storeCode }],
  });
  expect(org!.primary_contact_member_id).not.toBeNull();

  // Categories were written through Dexie → outbox; the sync push lands them server-side.
  const storeId = (org!.stores as { id: string }[])[0].id;
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from("inventory_categories")
          .select("name, organization_id")
          .eq("store_id", storeId)
          .is("deleted_at", null);
        return (data ?? []).map((c) => `${c.name}|${c.organization_id}`).sort();
      },
      { message: "the store's categories should sync to Supabase", timeout: 90_000 },
    )
    .toEqual(categories.map((name) => `${name}|${orgId}`).sort());
});
