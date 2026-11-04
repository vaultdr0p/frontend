import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { handleSearchParams } from "@/api/handleSearchParams";

import { fetchApi } from "@/helpers/fetchApi";
import { mapAllocationsResponse, vaultApiPath } from "@/helpers/vaultApi";

import type { AllocationStatus, ApiAllocationsResponse, VaultAllocationsPage } from "@/types/vault";

import type { AppError } from "@/types";

export type VaultAllocationsParams = {
  status?: AllocationStatus;
  recipient?: string;
  page?: number;
  page_limit?: number;
};

/**
 * Lists a vault's recipients and their claim status.
 *
 * This replaces a local-storage watchlist. The contract exposes
 * `get_allocation(address)` but no way to enumerate recipients, so the UI used
 * to keep its own list of addresses in `localStorage` and let an operator type
 * addresses in by hand to inspect recipients registered elsewhere.
 *
 * That workaround had three defects worth recording, since they are the reason
 * it is gone rather than merely tidied: the list was per-browser, so a second
 * operator or a new device saw an empty table; it silently omitted anyone
 * registered outside this UI; and the manual-entry field invited pasting an
 * address with no way to know whether it was ever registered at all.
 *
 * The backend indexes `registered` events, so `GET /allocations` is the
 * authoritative list — shared across operators, complete, and paginated.
 */
export const useVaultAllocations = (
  contractId: string,
  params?: VaultAllocationsParams,
  isEnabled = true,
): UseQueryResult<VaultAllocationsPage, AppError> =>
  useQuery<VaultAllocationsPage, AppError>({
    queryKey: [VAULT_QUERY_KEY, "allocations", contractId, { ...params }],
    queryFn: async () => {
      const search = handleSearchParams(params);
      const response: ApiAllocationsResponse = await fetchApi(
        `${vaultApiPath(contractId)}/allocations${search}`,
      );
      return mapAllocationsResponse(response);
    },
    enabled: isEnabled && Boolean(contractId),
    // Keep the current rows visible while paging or filtering the same vault,
    // so the table does not blank out between pages.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === contractId ? previous : undefined,
  });
