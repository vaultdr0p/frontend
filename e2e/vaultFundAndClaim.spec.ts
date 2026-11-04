import { Keypair, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { expect, test } from "@playwright/test";

import { createFundedTestnetAccount } from "./testnetAccount";

/**
 * Testnet happy path: fund a vault for real, then prove the UI reflects it.
 *
 * This exercises the whole chain end to end — the backend's envelope builder,
 * a real signature, submission to testnet, the event indexer, and the
 * dashboard's read path — against live infrastructure. It exists because every
 * other test here mocks at least one side of that chain, and the failures that
 * matter live in the seams: a field the backend renames, or an amount that
 * survives four layers as a string and gets parsed as a float in the fifth.
 *
 * **Why signing happens in Node, not in the browser.** Playwright cannot drive
 * the Freighter extension. The obvious workaround — a `window` hook that lets
 * the page inject a signer — would mean shipping a code path in production
 * where browser-global state can supply a signing key. That is exactly the
 * property this UI promises it does not have, so it is not worth a test.
 *
 * Instead the signature is produced here, outside the browser, with the
 * throwaway account's key. The browser then does what it does in production:
 * read. The wallet-rejection and network-mismatch branches that this split
 * leaves uncovered are covered by the component tests for
 * `SignTransactionDialog` and `useVaultWallet`.
 *
 * **Credentials.** The account is generated and Friendbot-funded at the start
 * of the run, kept in memory, and discarded when the process exits. No secret
 * is stored in the repository, in CI variables, or in this test's output.
 *
 * Requires a running SDP backend with `ENABLE_VAULT=true`, and a vault whose
 * admin is the account this test generates — which in practice means a vault
 * deployed per run. Skipped unless the environment supplies the rest.
 */

const BASE_URL = process.env.E2E_BASE_URL;
const API_URL = process.env.E2E_API_URL;
const SDP_TOKEN = process.env.E2E_SDP_TOKEN;
const CONTRACT_ID = process.env.E2E_VAULT_CONTRACT_ID;
const NETWORK_PASSPHRASE =
  process.env.E2E_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

const isConfigured = Boolean(BASE_URL && API_URL && SDP_TOKEN && CONTRACT_ID);

/** Amount to fund, in stroops. A string, never a float. */
const FUND_STROOPS = "100000000";

test.describe("vault funding happy path (testnet)", () => {
  // Skipped rather than failed when unconfigured, so `yarn test` and a plain
  // Playwright run stay green for a contributor with no testnet stack.
  test.skip(
    !isConfigured,
    "Set E2E_BASE_URL, E2E_API_URL, E2E_SDP_TOKEN and E2E_VAULT_CONTRACT_ID to run the testnet end-to-end test.",
  );

  test("funds the vault and the dashboard shows the new balance", async ({ page }) => {
    const account = await createFundedTestnetAccount();
    const apiBase = `${API_URL as string}/vault/${CONTRACT_ID as string}`;
    const authHeaders = {
      Authorization: `Bearer ${SDP_TOKEN as string}`,
      "Content-Type": "application/json",
    };

    // 1. Ask the backend to build the envelope — the same call the UI makes.
    const buildResponse = await fetch(`${apiBase}/transactions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        operation: "fund",
        source: account.publicKey,
        amount: FUND_STROOPS,
      }),
    });

    expect(buildResponse.ok, `build failed: HTTP ${buildResponse.status}`).toBe(true);

    const built = (await buildResponse.json()) as {
      xdr: string;
      network_passphrase: string;
      summary: Record<string, unknown>;
    };

    expect(built.network_passphrase).toBe(NETWORK_PASSPHRASE);
    expect(built.xdr).toBeTruthy();
    // The summary is what a signer would have been shown.
    expect(Object.keys(built.summary).length).toBeGreaterThan(0);

    // 2. Sign it with the throwaway key and submit to testnet.
    const transaction = TransactionBuilder.fromXDR(built.xdr, built.network_passphrase);
    transaction.sign(Keypair.fromSecret(account.secretKey));

    const server = new rpc.Server(`${API_URL as string}/rpc/user`, {
      headers: { Authorization: `Bearer ${SDP_TOKEN as string}` },
    });

    const sent = await server.sendTransaction(transaction);
    expect(sent.status, `submission rejected: ${sent.status}`).not.toBe("ERROR");

    const settled = await server.pollTransaction(sent.hash);
    expect(settled.status).toBe(rpc.Api.GetTransactionStatus.SUCCESS);

    // 3. The indexer must pick the event up and the API must report it.
    await expect(async () => {
      const overview = await fetch(apiBase, { headers: authHeaders });
      const body = (await overview.json()) as { balance: string };

      expect(BigInt(body.balance) >= BigInt(FUND_STROOPS)).toBe(true);
    }).toPass({ timeout: 120_000, intervals: [2_000] });

    // 4. Finally, the dashboard's own read path must show it.
    await page.goto(`${BASE_URL as string}/vault`);

    await expect(page.getByRole("heading", { name: /disbursement vault/i })).toBeVisible();

    const balance = page.getByTestId("vault-balance");
    await expect(balance).toBeVisible();
    // 100000000 stroops renders as "10" once trailing zeros are trimmed.
    await expect(balance).toContainText("10");
  });
});
