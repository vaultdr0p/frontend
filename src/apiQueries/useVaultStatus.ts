import { useRef } from "react";

import { useQuery, type Query } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { fetchVaultStatus } from "@/helpers/vaultApi";

import type { IndexerHealth } from "@/types/vault";

import type { AppError } from "@/types";

/** Poll interval while the status endpoint is answering. */
export const VAULT_STATUS_POLL_MS = 30_000;
/** Ceiling for the error backoff. */
export const VAULT_STATUS_MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Next poll delay: 30s normally; after consecutive failures 60s, 120s, 240s,
 * then capped at 5 min. A single success resets it.
 */
export const vaultStatusPollDelay = (consecutiveFailures: number): number =>
  consecutiveFailures <= 0
    ? VAULT_STATUS_POLL_MS
    : Math.min(VAULT_STATUS_POLL_MS * 2 ** consecutiveFailures, VAULT_STATUS_MAX_BACKOFF_MS);

/**
 * What a component may render. `health` is set **only** when the most recent
 * request succeeded.
 */
export type VaultStatusView =
  | { state: "loading"; health: null; error: null }
  | { state: "unavailable"; health: null; error: AppError | Error | null }
  | { state: "ready"; health: IndexerHealth; error: null };

/**
 * Polls the vault indexer's live health (`GET /vault/{contract_id}/status`).
 *
 * - Every 30s, backing off on errors (see `vaultStatusPollDelay`). The
 *   backoff replaces react-query's own retries (`retry: false`), so a down
 *   backend sees one request per interval, not a retry burst.
 * - Paused while the tab is hidden (`refetchIntervalInBackground: false`);
 *   on becoming visible again it refetches at once (`refetchOnWindowFocus`).
 * - Stopped on unmount: react-query clears the interval when the last
 *   observer goes away.
 *
 * react-query keeps the last successful `data` after a later fetch fails.
 * Rendering that would show a stale "Healthy" while the endpoint is failing,
 * so the view below ignores `data` whenever the query is in error.
 */
export const useVaultStatus = (contractId: string, isEnabled = true): VaultStatusView => {
  // Consecutive failures, for the backoff. react-query's own
  // `fetchFailureCount` cannot be used: it is reset to 0 at the *start* of
  // every fetch, so with `retry: false` it never exceeds 1 and the backoff
  // would stay at 60 s forever.
  const consecutiveFailures = useRef(0);

  const query = useQuery<IndexerHealth, AppError>({
    queryKey: [VAULT_QUERY_KEY, "status", contractId],
    queryFn: async () => {
      try {
        const health = await fetchVaultStatus(contractId);
        consecutiveFailures.current = 0;
        return health;
      } catch (error) {
        consecutiveFailures.current += 1;
        throw error;
      }
    },
    enabled: isEnabled && Boolean(contractId),
    refetchInterval: (q: Query<IndexerHealth, AppError>) =>
      vaultStatusPollDelay(q.state.status === "error" ? consecutiveFailures.current : 0),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  if (query.isError) {
    return { state: "unavailable", health: null, error: query.error ?? null };
  }
  if (query.data) {
    return { state: "ready", health: query.data, error: null };
  }
  return { state: "loading", health: null, error: null };
};
