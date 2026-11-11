/**
 * Types for the backend's vault endpoints.
 *
 * These mirror the OpenAPI 3.1 schema in `docs/VAULT_DESIGN.md` on
 * `vaultdr0p/backend` exactly. Two conventions from that spec drive the shapes
 * below and are worth stating once:
 *
 * 1. **Amounts are decimal strings, never JSON numbers.** The spec's `Amount`
 *    is `type: string, pattern: ^[0-9]+$`, because an i128 stroop value exceeds
 *    both int64 and IEEE-754 double precision. The wire types therefore keep
 *    them as `string`, and the domain types below convert to `bigint`. A
 *    `number` must never appear on an amount in either.
 * 2. **Nullable fields are explicitly `| null`,** not optional. The spec
 *    declares e.g. `gap_from_ledger: ['integer', 'null']`, so the field is
 *    always present and may hold null. Modelling it as `?:` would let a
 *    missing field and a known-null one be confused.
 */

/** `StellarAddress`: `^[GC][A-Z2-7]{55}$` — an account (G…) or contract (C…). */
export type StellarAddress = string;

/** `Amount`: i128 stroops as a decimal string. */
export type ApiAmount = string;

/** `AllocationStatus` enum, exactly as the spec declares it. */
export type AllocationStatus = "PENDING" | "CLAIMED" | "CANCELLED";

/** `VaultEvent.event_type` enum. */
export type VaultEventType =
  | "initialized"
  | "funded"
  | "registered"
  | "claimed"
  | "cancelled"
  | "withdrawn";

/** `BuildTransactionRequest.operation` enum. Note: `claim` is absent by design. */
export type VaultOperation = "fund" | "register" | "cancel" | "withdraw";

/** `IndexerStatus.status` enum. */
export type IndexerStatusValue = "healthy" | "degraded";

/** `IndexerHealth.status` enum, from `GET /vault/{contract_id}/status`. */
export type IndexerHealthStatus = "ok" | "lagging" | "stalled";

/**
 * `IndexerHealthReason` enum. Closed: one reason per status. Note that the
 * backend reports `never_indexed` with status `stalled`; the UI treats it as
 * a neutral "first sync pending", so it must branch on the reason.
 */
export type IndexerHealthReason =
  | "rpc_unreachable"
  | "never_indexed"
  | "no_recent_commit"
  | "lag_over_threshold"
  | "none";

// ---------------------------------------------------------------------------
// Wire types — one per spec schema, field names as sent
// ---------------------------------------------------------------------------

export type ApiIndexerStatus = {
  status: IndexerStatusValue;
  last_ledger: number;
  latest_ledger: number;
  lag_ledgers: number;
  last_indexed_at: string | null;
  gap_from_ledger: number | null;
  gap_to_ledger: number | null;
  degraded_reason: string | null;
};

/**
 * `IndexerHealth`: every key is always present. The four RPC-derived numbers
 * are null when RPC is unreachable — null, not 0, because 0 would read as
 * "caught up". `cursor_ledger` is null only when no indexer row exists.
 */
export type ApiIndexerHealth = {
  contract_id: StellarAddress;
  status: IndexerHealthStatus;
  reason: IndexerHealthReason;
  detail: string;
  degraded: boolean;
  cursor_ledger: number | null;
  rpc_latest_ledger: number | null;
  lag_ledgers: number | null;
  lag_seconds_estimate: number | null;
  last_event_at: string | null;
  retention_headroom: number | null;
  /** When the status was computed. The chain tip may be a few seconds older. */
  checked_at: string;
};

export type ApiVaultOverview = {
  contract_id: StellarAddress;
  admin: StellarAddress;
  token: StellarAddress;
  /** RFC 3339 timestamp of the claim deadline. */
  deadline: string;
  is_expired: boolean;
  total_allocated: ApiAmount;
  total_claimed: ApiAmount;
  balance: ApiAmount;
  /** Unencumbered balance. Null when the contract read failed. */
  available: ApiAmount | null;
  snapshot_ledger?: number;
  refreshed_at?: string;
  indexer: ApiIndexerStatus;
};

export type ApiAllocation = {
  recipient: StellarAddress;
  amount: ApiAmount;
  status: AllocationStatus;
  registered_at: string;
  registered_ledger: number;
  settled_at: string | null;
  settled_ledger: number | null;
};

export type ApiVaultEvent = {
  event_id: string;
  event_type: VaultEventType;
  ledger: number;
  ledger_closed_at: string;
  tx_hash: string;
  address: StellarAddress | null;
  amount: ApiAmount | null;
};

export type ApiVaultPagination = {
  total: number;
  page: number;
  pages: number;
};

export type ApiAllocationsResponse = {
  data: ApiAllocation[];
  pagination: ApiVaultPagination;
  indexer?: ApiIndexerStatus;
};

export type ApiVaultEventsResponse = {
  data: ApiVaultEvent[];
  pagination: ApiVaultPagination;
  indexer?: ApiIndexerStatus;
};

export type ApiBuildTransactionRequest = {
  operation: VaultOperation;
  source?: StellarAddress;
  recipient?: StellarAddress;
  destination?: StellarAddress;
  amount?: ApiAmount;
};

export type ApiBuildTransactionResponse = {
  /** Unsigned, pre-simulated transaction envelope. */
  xdr: string;
  network_passphrase: string;
  operation: VaultOperation;
  min_resource_fee?: string;
  /**
   * Human-readable description of what signing will do, built by the backend
   * from the same values it put in the envelope. Free-form by spec
   * (`type: object`), so it is read defensively rather than destructured.
   */
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Domain types — amounts as bigint, dates as Date
// ---------------------------------------------------------------------------

export type IndexerStatus = {
  status: IndexerStatusValue;
  isDegraded: boolean;
  lastLedger: number;
  latestLedger: number;
  lagLedgers: number;
  lastIndexedAt: Date | null;
  gapFromLedger: number | null;
  gapToLedger: number | null;
  degradedReason: string | null;
};

export type IndexerHealth = {
  contractId: StellarAddress;
  status: IndexerHealthStatus;
  reason: IndexerHealthReason;
  detail: string;
  isDegraded: boolean;
  cursorLedger: number | null;
  rpcLatestLedger: number | null;
  lagLedgers: number | null;
  lagSecondsEstimate: number | null;
  lastEventAt: Date | null;
  retentionHeadroom: number | null;
  checkedAt: Date;
};

export type VaultOverview = {
  contractId: StellarAddress;
  admin: StellarAddress;
  token: StellarAddress;
  deadline: Date;
  isExpired: boolean;
  /** All amounts are stroops. */
  totalAllocated: bigint;
  totalClaimed: bigint;
  balance: bigint;
  /** Null when the backend could not read it from the contract. */
  available: bigint | null;
  indexer: IndexerStatus;
};

export type VaultAllocation = {
  recipient: StellarAddress;
  /** Stroops. */
  amount: bigint;
  status: AllocationStatus;
  registeredAt: Date;
  registeredLedger: number;
  settledAt: Date | null;
  settledLedger: number | null;
};

export type VaultPagination = ApiVaultPagination;

export type VaultAllocationsPage = {
  allocations: VaultAllocation[];
  pagination: VaultPagination;
  indexer: IndexerStatus | null;
};

export type VaultEvent = {
  eventId: string;
  eventType: VaultEventType;
  ledger: number;
  ledgerClosedAt: Date;
  txHash: string;
  address: StellarAddress | null;
  amount: bigint | null;
};

export type BuildTransactionResult = {
  xdr: string;
  networkPassphrase: string;
  operation: VaultOperation;
  minResourceFee: string | null;
  /** Ordered label/value pairs for display, derived from `summary`. */
  summary: { label: string; value: string }[];
};
