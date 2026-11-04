/**
 * Mapping between the backend's vault wire format and this app's domain types.
 *
 * Every amount crossing this boundary is a decimal string on the wire and a
 * `bigint` inside the app. The conversion lives here, in one place, so no
 * component is ever tempted to call `Number()` on a stroop value — an i128
 * amount silently loses precision above 2^53, and a disbursement that is
 * wrong in the last two digits is still wrong.
 */
import { API_URL } from "@/constants/envVariables";

import type {
  ApiAllocation,
  ApiAllocationsResponse,
  ApiAmount,
  ApiBuildTransactionResponse,
  ApiIndexerStatus,
  ApiVaultEvent,
  ApiVaultEventsResponse,
  ApiVaultOverview,
  BuildTransactionResult,
  IndexerStatus,
  VaultAllocation,
  VaultAllocationsPage,
  VaultEvent,
  VaultOverview,
} from "@/types/vault";

/** The spec's `Amount` pattern. Anything else is a contract violation. */
const AMOUNT_PATTERN = /^[0-9]+$/;

/**
 * Converts a wire amount to stroops.
 *
 * Throws rather than coercing: a malformed amount means the client and server
 * disagree about the format, and showing a silently wrong balance is worse
 * than showing an error.
 */
export const parseApiAmount = (value: ApiAmount, field: string): bigint => {
  if (!AMOUNT_PATTERN.test(value)) {
    throw new Error(`The server sent an unreadable amount for ${field}.`);
  }
  return BigInt(value);
};

/** Same, but tolerates the nulls the spec allows on some amount fields. */
export const parseNullableApiAmount = (
  value: ApiAmount | null | undefined,
  field: string,
): bigint | null => (value === null || value === undefined ? null : parseApiAmount(value, field));

/**
 * Parses an RFC 3339 timestamp, returning null for an absent or unparseable
 * value so a bad date degrades one field instead of failing the whole page.
 */
export const parseApiDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Base path for every endpoint of one vault. */
export const vaultApiPath = (contractId: string): string =>
  `${API_URL}/vault/${encodeURIComponent(contractId)}`;

export const mapIndexerStatus = (api: ApiIndexerStatus): IndexerStatus => ({
  status: api.status,
  isDegraded: api.status === "degraded",
  lastLedger: api.last_ledger,
  latestLedger: api.latest_ledger,
  lagLedgers: api.lag_ledgers,
  lastIndexedAt: parseApiDate(api.last_indexed_at),
  gapFromLedger: api.gap_from_ledger ?? null,
  gapToLedger: api.gap_to_ledger ?? null,
  degradedReason: api.degraded_reason ?? null,
});

export const mapVaultOverview = (api: ApiVaultOverview): VaultOverview => {
  const deadline = parseApiDate(api.deadline);

  if (!deadline) {
    throw new Error("The server sent an unreadable claim deadline.");
  }

  return {
    contractId: api.contract_id,
    admin: api.admin,
    token: api.token,
    deadline,
    isExpired: api.is_expired,
    totalAllocated: parseApiAmount(api.total_allocated, "total allocated"),
    totalClaimed: parseApiAmount(api.total_claimed, "total claimed"),
    balance: parseApiAmount(api.balance, "balance"),
    available: parseNullableApiAmount(api.available, "available"),
    indexer: mapIndexerStatus(api.indexer),
  };
};

export const mapAllocation = (api: ApiAllocation): VaultAllocation => ({
  recipient: api.recipient,
  amount: parseApiAmount(api.amount, "allocation amount"),
  status: api.status,
  // registered_at is required by the spec; epoch is a visible fallback rather
  // than a crash if a server ever omits it.
  registeredAt: parseApiDate(api.registered_at) ?? new Date(0),
  registeredLedger: api.registered_ledger,
  settledAt: parseApiDate(api.settled_at),
  settledLedger: api.settled_ledger ?? null,
});

export const mapAllocationsResponse = (api: ApiAllocationsResponse): VaultAllocationsPage => ({
  allocations: api.data.map(mapAllocation),
  pagination: api.pagination ?? { total: api.data.length, page: 1, pages: 1 },
  indexer: api.indexer ? mapIndexerStatus(api.indexer) : null,
});

export const mapVaultEvent = (api: ApiVaultEvent): VaultEvent => ({
  eventId: api.event_id,
  eventType: api.event_type,
  ledger: api.ledger,
  ledgerClosedAt: parseApiDate(api.ledger_closed_at) ?? new Date(0),
  txHash: api.tx_hash,
  address: api.address ?? null,
  amount: parseNullableApiAmount(api.amount, "event amount"),
});

export const mapVaultEventsResponse = (api: ApiVaultEventsResponse) => ({
  events: api.data.map(mapVaultEvent),
  pagination: api.pagination ?? { total: api.data.length, page: 1, pages: 1 },
});

/** Turns a snake_case summary key into a sentence-case label. */
const humaniseKey = (key: string): string => {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Flattens the backend's free-form `summary` object into display pairs.
 *
 * The spec types `summary` as a plain object with no fixed properties, so it
 * is read defensively: anything that is not a primitive is JSON-encoded rather
 * than rendered as "[object Object]". `effect` is hoisted to the top because
 * it is the plain-language sentence describing what signing will do, and that
 * is the one line a signer must not miss.
 */
export const mapTransactionSummary = (
  summary: Record<string, unknown>,
): { label: string; value: string }[] => {
  const entries = Object.entries(summary ?? {});
  const ordered = [
    ...entries.filter(([key]) => key === "effect"),
    ...entries.filter(([key]) => key !== "effect"),
  ];

  return ordered.map(([key, raw]) => ({
    label: humaniseKey(key),
    value:
      raw === null || raw === undefined
        ? "—"
        : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
          ? String(raw)
          : JSON.stringify(raw),
  }));
};

export const mapBuildTransactionResponse = (
  api: ApiBuildTransactionResponse,
): BuildTransactionResult => ({
  xdr: api.xdr,
  networkPassphrase: api.network_passphrase,
  operation: api.operation,
  minResourceFee: api.min_resource_fee ?? null,
  summary: mapTransactionSummary(api.summary),
});
