import { API_URL } from "@/constants/envVariables";
import { vaultContractId, vaultNetworkPassphrase } from "@/constants/vault";

import { getSdpTenantName } from "@/helpers/getSdpTenantName";
import { localStorageSessionToken } from "@/helpers/localStorageSessionToken";

import { Client as VaultClient } from "@/contracts/disbursementVault";

/**
 * Builds a bindings client for the disbursement vault.
 *
 * RPC goes through the SDP backend's authenticated proxy (`POST /rpc/user`),
 * the same path `createAuthenticatedRpcServer` uses, rather than straight to a
 * public RPC node. That keeps RPC credentials server-side and means vault
 * reads inherit the session the rest of the dashboard already requires.
 *
 * `publicKey` is the connected wallet address. It is needed so simulation can
 * build the correct auth footprint; it is a public address only — no secret
 * key is ever passed here.
 */
export const createVaultClient = ({
  publicKey,
  organizationName,
}: {
  publicKey?: string;
  organizationName?: string;
} = {}): VaultClient => {
  const token = localStorageSessionToken.get();

  if (!token) {
    throw new Error("Authentication required for vault requests");
  }

  const rpcUrl = `${API_URL}/rpc/user`;

  return new VaultClient({
    contractId: vaultContractId,
    networkPassphrase: vaultNetworkPassphrase,
    rpcUrl,
    allowHttp: new URL(rpcUrl).protocol === "http:",
    publicKey,
    headers: {
      Authorization: `Bearer ${token}`,
      "SDP-Tenant-Name": getSdpTenantName(organizationName),
    },
  });
};
