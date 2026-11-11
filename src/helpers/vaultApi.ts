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

import { fetchApi } from "@/helpers/fetchApi";

import type {
  ApiAllocation,
  ApiAllocationsResponse,
  ApiAmount,
  ApiBuildTransactionResponse,
  ApiIndexerHealth,
  ApiIndexerStatus,
  ApiVaultEvent,
  ApiVaultEventsResponse,
  ApiVaultOverview,
  BuildTransactionResult,
  IndexerHealth,
  IndexerHealthReason,
  IndexerHealthStatus,
  IndexerStatus,
  VaultAllocation,
  VaultAllocationsPage,
  VaultEvent,
  VaultOverview,
} from "@/types/vault";

import type { AppError } from "@/types";

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

/**
 * The backend's message for a vault whose creation event the indexer has never
 * seen (`GET /vault/{contract_id}` → 404).
 *
 * COUPLING: this is matched by exact text because the backend has no
 * machine-readable code for it yet. It must stay identical to the string in the
 * backend's `internal/serve/httphandler/vault_handler.go`. If the backend
 * rewords it, `isVaultNotIndexedError` stops matching and the page falls back
 * to the generic red error — it fails safe, but loses the neutral state. The
 * fix is a backend error code (`vault_not_indexed`), after which this should
 * match on that code instead.
 */
export const VAULT_NOT_INDEXED_MESSAGE = "Vault has not been indexed yet.";

/**
 * True only for the overview's "not indexed yet" 404.
 *
 * Both the status and the message are required. The status alone is not
 * enough: "Vault not found." is also a JSON 404, and an unregistered route
 * (vault feature off) is a plain-text 404. The message alone is not enough
 * either: it would match the same text arriving with any other status.
 */
export const isVaultNotIndexedError = (
  error: Pick<AppError, "message" | "status"> | null | undefined,
): boolean => error?.status === 404 && error.message === VAULT_NOT_INDEXED_MESSAGE;

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

/**
 * The status/reason pairs the backend can send. The spec ties each reason to
 * exactly one status, so a mismatched pair is a contract violation, not a
 * state to render.
 */
const HEALTH_REASONS_BY_STATUS: Record<IndexerHealthStatus, readonly IndexerHealthReason[]> = {
  ok: ["none"],
  lagging: ["lag_over_threshold"],
  stalled: ["rpc_unreachable", "never_indexed", "no_recent_commit"],
};

const isHealthStatus = (value: unknown): value is IndexerHealthStatus =>
  typeof value === "string" && Object.hasOwn(HEALTH_REASONS_BY_STATUS, value);

/** A nullable integer field: null stays null, anything that is not a number throws. */
const parseNullableCount = (value: unknown, field: string): number | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`The server sent an unreadable ${field}.`);
  }
  return value;
};

/**
 * Maps `GET /vault/{contract_id}/status`.
 *
 * Strict on purpose: an unknown status or reason throws, and the caller shows
 * "Status unavailable". Guessing a state for an unrecognised value could
 * render a broken indexer as healthy, which is the one outcome this endpoint
 * exists to prevent.
 */
export const mapIndexerHealth = (api: ApiIndexerHealth): IndexerHealth => {
  if (!isHealthStatus(api.status)) {
    throw new Error("The server sent an unknown indexer status.");
  }
  if (!HEALTH_REASONS_BY_STATUS[api.status].includes(api.reason)) {
    throw new Error("The server sent an indexer reason that does not match its status.");
  }

  const checkedAt = parseApiDate(api.checked_at);
  if (!checkedAt) {
    throw new Error("The server sent an unreadable status time.");
  }

  return {
    contractId: api.contract_id,
    status: api.status,
    reason: api.reason,
    detail: typeof api.detail === "string" ? api.detail : "",
    isDegraded: api.degraded === true,
    cursorLedger: parseNullableCount(api.cursor_ledger, "cursor ledger"),
    rpcLatestLedger: parseNullableCount(api.rpc_latest_ledger, "latest ledger"),
    lagLedgers: parseNullableCount(api.lag_ledgers, "lag"),
    lagSecondsEstimate: parseNullableCount(api.lag_seconds_estimate, "lag estimate"),
    lastEventAt: parseApiDate(api.last_event_at),
    retentionHeadroom: parseNullableCount(api.retention_headroom, "retention headroom"),
    checkedAt,
  };
};

/** Reads one vault's live indexer health. Auth headers come from fetchApi. */
export const fetchVaultStatus = async (contractId: string): Promise<IndexerHealth> => {
  const response: ApiIndexerHealth = await fetchApi(`${vaultApiPath(contractId)}/status`);
  return mapIndexerHealth(response);
};

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
