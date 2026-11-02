import { useCallback, useState } from "react";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { createVaultClient } from "@/helpers/createVaultClient";
import { vaultErrorMessage } from "@/helpers/vault";

import type { AllocationStatus } from "@/contracts/disbursementVault";

const WATCHLIST_STORAGE_KEY = "sdp_vault_recipients";

export type VaultAllocation = {
  recipient: string;
  /** Allocation amount in stroops. */
  amount: bigint;
  status: AllocationStatus["tag"];
};

/** A recipient address that is being tracked but has no allocation on-chain. */
export type MissingAllocation = { recipient: string };

export type VaultAllocations = {
  allocations: VaultAllocation[];
  missing: MissingAllocation[];
};

/** Reads the persisted watchlist, tolerating absent or corrupt storage. */
const readWatchlist = (): string[] => {
  try {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    // Corrupt or unavailable storage must not break the page; an empty
    // watchlist still lets the operator add addresses by hand.
    return [];
  }
};

/**
 * The set of recipient addresses the table displays.
 *
 * The contract exposes `get_allocation(address)` but no way to enumerate
 * recipients — allocations are individual persistent entries, deliberately so
 * (see the contract's DESIGN.md), which is what keeps per-call cost O(1).
 * Enumeration is therefore an indexing concern, and the backend's vault
 * endpoints are where a real list would come from.
 *
 * Until those exist, the addresses are kept in local storage: every successful
 * `register` from this UI adds one, and an operator can add an address
 * manually to inspect a recipient registered elsewhere. Allocation data itself
 * is always read from the chain, so the table's amounts and statuses are
 * authoritative even though the address list is local.
 */
export const useVaultWatchlist = () => {
  // Lazy initialiser rather than an effect: storage is available on first
  // render, so seeding state here avoids a redundant render pass and the
  // set-state-in-effect pattern.
  const [addresses, setAddresses] = useState<string[]>(readWatchlist);

  const persist = useCallback((next: string[]) => {
    setAddresses(next);
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private-mode storage failures are non-fatal: the list simply does not
      // survive a reload.
    }
  }, []);

  const add = useCallback(
    (address: string) => {
      const trimmed = address.trim();
      if (!trimmed || addresses.includes(trimmed)) {
        return;
      }
      persist([...addresses, trimmed]);
    },
    [addresses, persist],
  );

  const remove = useCallback(
    (address: string) => persist(addresses.filter((entry) => entry !== address)),
    [addresses, persist],
  );

  return { addresses, add, remove };
};

/**
 * Reads each tracked recipient's allocation from the contract.
 *
 * `get_allocation` returns an Option, so an address with no allocation comes
 * back as absent rather than as an error. Those are reported separately in
 * `missing` so the table can distinguish "not registered" from "registered and
 * pending" instead of showing a misleading zero.
 */
export const useVaultAllocations = (addresses: string[]): UseQueryResult<VaultAllocations, Error> =>
  useQuery<VaultAllocations, Error>({
    // Addresses are part of the key so adding one refetches just that set.
    queryKey: [VAULT_QUERY_KEY, "allocations", [...addresses].sort()],
    queryFn: async () => {
      const client = createVaultClient();

      try {
        const results = await Promise.all(
          addresses.map(async (recipient) => {
            const { result } = await client.get_allocation({ recipient });
            return { recipient, allocation: result };
          }),
        );

        const allocations: VaultAllocation[] = [];
        const missing: MissingAllocation[] = [];

        for (const { recipient, allocation } of results) {
          if (allocation) {
            allocations.push({
              recipient,
              amount: allocation.amount,
              status: allocation.status.tag,
            });
          } else {
            missing.push({ recipient });
          }
        }

        return { allocations, missing };
      } catch (error) {
        throw new Error(vaultErrorMessage(error));
      }
    },
    enabled: addresses.length > 0,
  });
