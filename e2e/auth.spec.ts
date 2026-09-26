import { issueDemoGrant } from "./support/api";
import { expect, test } from "./support/fixtures";
import { readLocalRows } from "./support/session";

// Happy path 1 — sign-in. Google OAuth + PIN can't be scripted, so this drives the
// real demo launch link: demo-login "issue" (as platform admin) → /demo/launch redeems it
// in the browser → the member is cached exactly as after a Google/PIN sign-in → routed.

test("a demo launch link signs the org owner in and lands in their organization", async ({
  page,
  env,
  demoOrg,
}) => {
  const token = await issueDemoGrant(env, demoOrg.ownerMemberId);

  await page.goto(`/demo/launch#token=${encodeURIComponent(token)}`);

  // Single org, org-level role only → /org → auto-picks the one organization.
  await expect(page).toHaveURL(new RegExp(`/org/${demoOrg.id}`));
  await expect(page.getByText(demoOrg.name).first()).toBeVisible();

  // The session is the app's own Dexie cache (not a cookie): one active member, with a JWT.
  const members = await readLocalRows<{ id: string; is_active: number; jwt: string }>(
    page,
    "members",
  );
  const active = members.filter((m) => m.is_active === 1);
  expect(active).toHaveLength(1);
  expect(active[0].id).toBe(demoOrg.ownerMemberId);
  expect(active[0].jwt.split(".")).toHaveLength(3);
});

test("the platform admin session opens the admin console", async ({ adminPage }) => {
  await adminPage.goto("/admin/organizations");
  await expect(adminPage).toHaveURL(/\/admin\/organizations/);
  await expect(
    adminPage.getByRole("heading", { name: "Organizations", exact: true }),
  ).toBeVisible();
});
