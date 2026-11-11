/**
 * Presentation rules for the vault indexer's live health, shared by the
 * status indicator and the indexer banner so both always agree.
 */
import type { VaultStatusView } from "@/apiQueries/useVaultStatus";

import type { IndexerHealthReason } from "@/types/vault";

/** What the indicator shows. Never derived from colour alone: each has a label and an icon. */
export type VaultStatusKind =
  | "loading"
  | "healthy"
  | "lagging"
  | "stalled"
  | "first_sync"
  | "unavailable";

/**
 * Picks the display kind. Branches on the reason, not only the status: the
 * backend reports `never_indexed` as status `stalled`, but a vault that has
 * not finished its first sync is not broken, so it gets the neutral
 * "first sync pending" instead of an error state.
 */
export const vaultStatusKind = (view: VaultStatusView): VaultStatusKind => {
  if (view.state === "loading") {
    return "loading";
  }
  if (view.state === "unavailable") {
    return "unavailable";
  }
  if (view.health.reason === "never_indexed") {
    return "first_sync";
  }
  switch (view.health.status) {
    case "ok":
      return "healthy";
    case "lagging":
      return "lagging";
    default:
      return "stalled";
  }
};

export const VAULT_STATUS_LABELS: Record<VaultStatusKind, string> = {
  loading: "Checking…",
  healthy: "Healthy",
  lagging: "Lagging",
  stalled: "Stalled",
  first_sync: "First sync pending",
  unavailable: "Status unavailable",
};

/** One short sentence per reason, for the live region. */
export const VAULT_STATUS_REASON_TEXT: Record<IndexerHealthReason, string> = {
  none: "The indexer is keeping up with the network.",
  lag_over_threshold: "The indexer is behind the network.",
  no_recent_commit: "The indexer has stopped updating.",
  rpc_unreachable: "Stellar RPC cannot be reached, so lag cannot be measured.",
  never_indexed: "The indexer has not finished its first sync yet.",
};

/** A count that may be null. Null is "unknown" — never 0, which would read as caught up. */
export const formatCount = (value: number | null): string =>
  value === null ? "unknown" : value.toLocaleString("en-US");

/** Lag as "120 ledgers (~10 min)", or "unknown". */
export const formatLag = (ledgers: number | null, seconds: number | null): string => {
  if (ledgers === null) {
    return "unknown";
  }
  const unit = ledgers === 1 ? "ledger" : "ledgers";
  if (seconds === null) {
    return `${formatCount(ledgers)} ${unit}`;
  }
  return `${formatCount(ledgers)} ${unit} (~${formatDuration(seconds)})`;
};

/** "45 s", "12 min", "3 h", "2 d". */
export const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} h`;
  }
  return `${Math.round(hours / 24)} d`;
};

/** "checked 10 s ago". A time slightly in the future (clock skew) reads as 0 s. */
export const formatCheckedAgo = (checkedAt: Date, now: Date): string =>
  `checked ${formatDuration((now.getTime() - checkedAt.getTime()) / 1000)} ago`;
