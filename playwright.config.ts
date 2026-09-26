import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Same env files Vite reads, so one .env.local serves `pnpm dev` and `pnpm e2e`.
loadEnv({ path: [".env.local", ".env"], quiet: true });

// E2E_BASE_URL points the suite at an already-running app (e.g. a Vercel preview);
// otherwise Playwright starts the Vite dev server itself.
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:5173";

/**
 * Happy-path end-to-end suite (constitution §7 DoD: works offline, syncs, 375px).
 * Runs against the LIVE Supabase project using `is_demo` orgs only — every test creates
 * its own org and hard-deletes it afterwards. See e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // Live-DB round trips (RPCs, edge functions, sync) make these slower than unit tests.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Serial: every test writes to the one shared live project; keep the load and the
  // blast radius small.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // The dev build registers a service worker (vite-plugin-pwa devOptions). Block it so
    // each test starts from the network + Dexie only; offline behaviour is exercised via
    // Dexie, which is the app's real offline source of truth (§2.I).
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // §7.3: every module must work at a 375px phone width.
      name: "mobile-375",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev --port 5173 --strictPort",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
