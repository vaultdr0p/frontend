/**
 * Test environment setup. Runs before any test module is imported, which
 * matters: `@/constants/envVariables` performs a **top-level await fetch** of
 * `/settings/env-config.js` at module load, so anything importing it
 * transitively would otherwise fail with `ERR_INVALID_URL` under jsdom, where
 * there is no server and no base URL for a root-relative path.
 *
 * The module already supports being short-circuited via
 * REACT_APP_DISABLE_WINDOW_ENV, but it then reads `window._env_.API_URL`
 * without optional chaining, so the object has to exist too.
 */
process.env.REACT_APP_DISABLE_WINDOW_ENV = "true";

window._env_ = {
  DISABLE_TENANT_PREFIL_FROM_DOMAIN: "false",
  API_URL: "http://localhost:8000",
  STELLAR_EXPERT_URL: "https://stellar.expert/explorer/testnet",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  RPC_ENABLED: true,
  RECAPTCHA_SITE_KEY: "",
  SINGLE_TENANT_MODE: false,
  // Left unset so `@/constants/vault` falls back to the ids baked into the
  // generated bindings, which is what production does when unconfigured.
  VAULT_CONTRACT_ID: "",
  VAULT_NETWORK_PASSPHRASE: "",
};

// jest-dom's matchers (toBeInTheDocument, toHaveTextContent, ...). This mirrors
// what src/setupTests.ts has always declared, which was dead code until the
// repo gained a test runner.
//
// The `/vitest` entry point is required rather than the bare package: it both
// registers the matchers and augments Vitest's `Assertion` interface, so
// `tsc --noEmit` knows about them. Importing "@testing-library/jest-dom"
// registers them at runtime but leaves every matcher a type error.
import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach } from "vitest";

/**
 * The design system's `Modal` portals into `document.getElementById("root")`,
 * which `index.html` provides in the real app. jsdom starts with a bare body,
 * so without this the portal target is null and a modal renders nothing at
 * all — a test then fails against an empty body instead of its assertion.
 */
beforeEach(() => {
  if (!document.getElementById("root")) {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  }
});

afterEach(() => {
  document.getElementById("root")?.remove();
  // Modal adds this to <body> while open; left behind, it leaks into the
  // next test's environment.
  document.body.classList.remove("modal-open");
});
