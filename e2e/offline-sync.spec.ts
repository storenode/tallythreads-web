import { clientFor } from "./support/api";
import { expect, test } from "./support/fixtures";
import { clientNavigate, readLocalRows } from "./support/session";

// Happy path 5 — offline-first round trip (constitution §2.I, §7 DoD items 2 + 4):
// create a purchase trip with the network OFF → it lives in Dexie with a pending outbox
// entry and is NOT on the server → reconnect → it syncs to Supabase and shows "Synced ✓".

interface LocalTrip {
  title: string;
  organization_id: string;
  _dirty: 0 | 1;
}

test("a trip created offline syncs to Supabase after reconnecting", async ({
  ownerPage: page,
  context,
  env,
  ownerSession,
  demoOrg,
  tag,
}) => {
  const title = `E2E offline trip ${tag}`;
  const listPath = `/org/${demoOrg.id}/purchase-trips`;
  const db = clientFor(env, ownerSession.jwt);
  const serverTrips = async () => {
    const { data, error } = await db
      .from("purchase_trips")
      .select("title, status")
      .eq("organization_id", demoOrg.id)
      .eq("title", title);
    if (error) throw error;
    return data;
  };

  // Load the app while online. Visiting the detail route once (a not-found id) pulls its
  // lazy chunk in too, so the whole create → detail flow can run with no network. The
  // installed PWA gets the same effect from its service-worker precache.
  await page.goto(listPath);
  await expect(page.getByRole("button", { name: "New trip" })).toBeVisible();
  await clientNavigate(page, `${listPath}/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText("Trip not found.")).toBeVisible();
  await clientNavigate(page, listPath);
  await expect(page.getByRole("button", { name: "New trip" })).toBeVisible();

  // --- Offline: create the trip ------------------------------------------------------------
  await context.setOffline(true);
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Trip title").fill(title);
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Status: planning")).toBeVisible();

  // Written locally, flagged dirty, and not on the server.
  const local = (await readLocalRows<LocalTrip>(page, "purchase_trips")).filter(
    (t) => t.title === title,
  );
  expect(local).toHaveLength(1);
  expect(local[0]).toMatchObject({ organization_id: demoOrg.id, _dirty: 1 });
  expect(await serverTrips()).toEqual([]);

  await clientNavigate(page, listPath);
  const row = page.getByRole("link").filter({ hasText: title });
  await expect(row.getByText("Pending sync ↑")).toBeVisible();

  // --- Reconnect: the `online` event triggers a sync push --------------------------------
  await context.setOffline(false);
  await expect
    .poll(serverTrips, {
      message: "the offline-created trip should reach Supabase",
      timeout: 90_000,
    })
    .toEqual([{ title, status: "planning" }]);
  await expect(row.getByText("Synced ✓")).toBeVisible({ timeout: 30_000 });
});
