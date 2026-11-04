import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { fetchApi } from "@/helpers/fetchApi";
import { mapVaultOverview, vaultApiPath } from "@/helpers/vaultApi";

import type { ApiVaultOverview, VaultOverview } from "@/types/vault";

import type { AppError } from "@/types";

/**
 * Reads one vault's configuration, balances and indexer health.
 *
 * This comes from the backend's `GET /vault/{contract_id}` rather than from
 * the contract directly. The backend indexes the contract's events, so it can
 * answer questions the contract cannot — above all "who are the recipients?",
 * which has no on-chain enumeration — and it returns every figure from a
 * single consistent snapshot. Reading the contract per field, as this hook
 * previously did, could show `available` from a newer ledger than
 * `total_allocated` and so display a pairing that was never true.
 *
 * It also means the UI inherits the indexer's own honesty: the `indexer` block
 * says how far behind the data is, and whether there is a known gap.
 */
export const useVaultOverview = (
  contractId: string,
  isEnabled = true,
): UseQueryResult<VaultOverview, AppError> =>
  useQuery<VaultOverview, AppError>({
    queryKey: [VAULT_QUERY_KEY, "overview", contractId],
    queryFn: async () => {
      const response: ApiVaultOverview = await fetchApi(vaultApiPath(contractId));
      return mapVaultOverview(response);
    },
    enabled: isEnabled && Boolean(contractId),
  });
