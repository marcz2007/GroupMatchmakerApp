import { defineConfig, devices } from "@playwright/test";

// Layer 2 — web E2E. Targets the deployed site by default (what a real user
// faces); override BASE_URL to point at a local `yarn web` server. Events are
// seeded into the same Supabase via the integration harness (tests/harness.mjs).
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://grappleapp.co.uk",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
