import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the testnet end-to-end test.
 *
 * Deliberately separate from Vitest: `vitest.config.ts` only collects
 * `src/**` and runs in jsdom, so the specs in `e2e/` never run as part of
 * `yarn test`. That split is intentional — the end-to-end test needs a real
 * browser, a running backend and live testnet, none of which belong in the
 * unit-test gate.
 *
 * No `webServer` block: the test targets an already-running deployment via
 * `E2E_BASE_URL`, because it also needs a backend with `ENABLE_VAULT=true`
 * and a deployed vault, which this config cannot bring up on its own.
 */
export default defineConfig({
  testDir: "./e2e",
  // Live testnet: ledgers close every ~5s and the indexer polls, so the
  // default 30s is not enough for a full round trip.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // One worker, no retries locally: the test funds a real account and
  // submits real transactions, so concurrent runs would interfere.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
