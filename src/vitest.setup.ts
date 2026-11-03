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
import "@testing-library/jest-dom";
