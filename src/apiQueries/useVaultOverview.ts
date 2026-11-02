import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { createVaultClient } from "@/helpers/createVaultClient";
import { vaultErrorMessage } from "@/helpers/vault";

export type VaultOverview = {
  admin: string;
  token: string;
  /** Unix seconds after which allocations may be cancelled. */
  deadline: number;
  /** Sum of pending allocations, in stroops. */
  totalAllocated: bigint;
  /** Lifetime claimed, in stroops. */
  totalClaimed: bigint;
  /** Balance not encumbered by a pending allocation, in stroops. */
  available: bigint;
  /** True once the deadline has passed, i.e. cancel is permitted. */
  isExpired: boolean;
};

/**
 * Reads the vault's configuration and totals straight from the contract.
 *
 * Each value comes from a read-only simulation, so nothing is submitted to the
 * network and no signature is needed. They are fetched together because the UI
 * only ever shows them as one coherent snapshot — a page rendering `available`
 * from a newer ledger than `totalAllocated` could show a nonsensical pairing.
 */
export const useVaultOverview = (isEnabled = true): UseQueryResult<VaultOverview, Error> =>
  useQuery<VaultOverview, Error>({
    queryKey: [VAULT_QUERY_KEY, "overview"],
    queryFn: async () => {
      const client = createVaultClient();

      try {
        const [admin, token, deadline, totalAllocated, totalClaimed, available] = await Promise.all(
          [
            client.get_admin(),
            client.get_token(),
            client.get_deadline(),
            client.total_allocated(),
            client.total_claimed(),
            client.available(),
          ],
        );

        // Fallible contract methods return a Result; `unwrap()` throws the
        // typed contract error, which vaultErrorMessage turns into prose.
        const deadlineSeconds = Number(deadline.result.unwrap());

        return {
          admin: admin.result.unwrap(),
          token: token.result.unwrap(),
          deadline: deadlineSeconds,
          totalAllocated: totalAllocated.result,
          totalClaimed: totalClaimed.result,
          available: available.result.unwrap(),
          isExpired: Date.now() >= deadlineSeconds * 1000,
        };
      } catch (error) {
        throw new Error(vaultErrorMessage(error));
      }
    },
    enabled: isEnabled,
  });
