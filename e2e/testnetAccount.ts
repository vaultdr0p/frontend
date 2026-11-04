import { Keypair } from "@stellar/stellar-sdk";

/**
 * Creates and funds a throwaway testnet account for one test run.
 *
 * **No secret is stored anywhere.** The keypair is generated in memory at the
 * start of the run, funded by Friendbot, used, and discarded when the process
 * exits. Nothing is written to disk, to the repository, to CI variables, or to
 * the test's own output: `secret()` is only ever handed to the signing stub,
 * and the logging below deliberately prints the public key alone.
 *
 * That is the whole reason this helper exists rather than a fixture account.
 * A committed testnet seed is still a committed credential: it teaches the
 * habit, it survives in git history, and anyone can drain or grief the account
 * it belongs to. Generating one per run costs a Friendbot call and removes the
 * question entirely.
 */

const FRIENDBOT_URL = "https://friendbot.stellar.org";

export type ThrowawayAccount = {
  publicKey: string;
  /** Held in memory for the duration of the run only. */
  secretKey: string;
};

export const createFundedTestnetAccount = async (): Promise<ThrowawayAccount> => {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();

  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);

  if (!response.ok) {
    // Friendbot is rate-limited and occasionally down. Fail with something
    // actionable rather than a later "account not found" from the contract.
    throw new Error(
      `Friendbot could not fund the throwaway account ${publicKey} (HTTP ${response.status}). ` +
        "Testnet may be rate-limiting; retry shortly.",
    );
  }

  // Public key only — never the secret.
  console.log(`Funded throwaway testnet account ${publicKey}`);

  return { publicKey, secretKey: keypair.secret() };
};
