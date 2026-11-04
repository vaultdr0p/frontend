/**
 * Configuration for the disbursement vault contract.
 *
 * The contract id and network passphrase come from the runtime `window._env_`
 * config (see `envVariables.ts`) so a deployment can be repointed without a
 * rebuild. The values generated into the bindings are used only as a fallback,
 * which keeps local development working with no extra setup.
 */
import { VAULT_CONTRACT_ID, VAULT_NETWORK_PASSPHRASE } from "@/constants/envVariables";

import { networks } from "@/contracts/disbursementVault";

/** Contract id of the vault this UI talks to. */
export const vaultContractId = VAULT_CONTRACT_ID || networks.testnet.contractId;

/** Network passphrase used when building and signing vault transactions. */
export const vaultNetworkPassphrase =
  VAULT_NETWORK_PASSPHRASE || networks.testnet.networkPassphrase;

/**
 * Stroops per unit for a 7-decimal Stellar asset. Vault amounts are `i128`
 * stroops on-chain but are entered and displayed as decimal units.
 *
 * Built with `BigInt()` rather than a `10_000_000n` literal because this
 * project targets ES2017, where BigInt literals are not available. The bigint
 * *type* is fine — only the `n` suffix is rejected.
 */
export const STROOPS_PER_UNIT = BigInt(10_000_000);

/** Zero as a bigint, for the same ES2017 reason. */
export const ZERO_STROOPS = BigInt(0);

/** Decimal places a 7-decimal Stellar asset supports. */
export const ASSET_DECIMALS = 7;

/** Query key root for every vault read, so one invalidate refreshes them all. */
export const VAULT_QUERY_KEY = "vault";
