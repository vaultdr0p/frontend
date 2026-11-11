/**
 * Test fixtures for the vault status endpoint. Shapes follow the
 * `IndexerHealth` schema in vaultdr0p/backend `docs/VAULT_DESIGN.md`.
 * Test-only: imported from `*.test.ts(x)` files, never from app code.
 */
import type { VaultStatusView } from "@/apiQueries/useVaultStatus";

import { mapIndexerHealth } from "@/helpers/vaultApi";

import type { ApiIndexerHealth, IndexerHealthReason, IndexerHealthStatus } from "@/types/vault";

export const STATUS_CONTRACT_ID = "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53";

export const apiHealth = (overrides: Partial<ApiIndexerHealth> = {}): ApiIndexerHealth => ({
  contract_id: STATUS_CONTRACT_ID,
  status: "ok",
  reason: "none",
  detail: "indexer is 2 ledgers behind the chain tip (threshold 60)",
  degraded: false,
  cursor_ledger: 812_458,
  rpc_latest_ledger: 812_460,
  lag_ledgers: 2,
  lag_seconds_estimate: 10,
  last_event_at: "2026-11-11T09:12:05Z",
  retention_headroom: 120_958,
  checked_at: "2026-11-11T09:20:30Z",
  ...overrides,
});

/** What the backend sends for RPC being down: the four RPC-derived numbers are null. */
export const rpcDownNulls = {
  rpc_latest_ledger: null,
  lag_ledgers: null,
  lag_seconds_estimate: null,
  retention_headroom: null,
} as const;

/** Every status/reason pair the spec allows, with realistic field values. */
export const ALL_HEALTH_CASES: {
  status: IndexerHealthStatus;
  reason: IndexerHealthReason;
  api: ApiIndexerHealth;
}[] = [
  { status: "ok", reason: "none", api: apiHealth() },
  {
    status: "lagging",
    reason: "lag_over_threshold",
    api: apiHealth({
      status: "lagging",
      reason: "lag_over_threshold",
      cursor_ledger: 812_340,
      lag_ledgers: 120,
      lag_seconds_estimate: 600,
      retention_headroom: 120_840,
    }),
  },
  {
    status: "stalled",
    reason: "no_recent_commit",
    api: apiHealth({ status: "stalled", reason: "no_recent_commit" }),
  },
  {
    status: "stalled",
    reason: "rpc_unreachable",
    api: apiHealth({ status: "stalled", reason: "rpc_unreachable", ...rpcDownNulls }),
  },
  {
    status: "stalled",
    reason: "never_indexed",
    api: apiHealth({
      status: "stalled",
      reason: "never_indexed",
      cursor_ledger: null,
      lag_ledgers: null,
      lag_seconds_estimate: null,
      retention_headroom: null,
      last_event_at: null,
    }),
  },
];

export const readyView = (api: ApiIndexerHealth): VaultStatusView => ({
  state: "ready",
  health: mapIndexerHealth(api),
  error: null,
});

export const unavailableView: VaultStatusView = {
  state: "unavailable",
  health: null,
  error: new Error("Failed to fetch"),
};

export const loadingView: VaultStatusView = { state: "loading", health: null, error: null };
