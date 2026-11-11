import { Notification } from "@stellar/design-system";

import type { VaultStatusView } from "@/apiQueries/useVaultStatus";

import { formatCount, formatLag } from "@/helpers/vaultStatus";

import type { IndexerHealth, IndexerStatus } from "@/types/vault";

/**
 * Explains the indexer's health in plain language.
 *
 * The backend reports `status`, `lag_ledgers` and, when a vault is degraded,
 * the bounds of the gap in its event history. Those are ledger numbers, which
 * mean nothing to most operators, so this component says what they imply:
 * that some of the vault's history could not be read and never will be, and
 * that balances still come from the contract and remain correct.
 *
 * It deliberately does not hide a degraded vault behind a dismissible toast.
 * An incomplete history is a standing caveat on everything else on the page.
 *
 * Two independent sources feed it:
 * - `indexer` (embedded in the overview) says whether the history has a
 *   permanent gap: the degraded block.
 * - `health` (`GET /vault/{contract_id}/status`, polled) says whether the
 *   indexer is keeping up right now: one message per reason. It replaces the
 *   old lag message, which keyed on `indexer.lag_ledgers` — a field the
 *   backend always reports as 0 because that endpoint never calls RPC.
 *
 * Health is only rendered from a *successful* latest check; an unavailable
 * status adds nothing here and is shown by the status indicator instead.
 */

const DegradedHistoryNotice = ({ indexer }: { indexer: IndexerStatus }) => {
  const hasBounds = indexer.gapFromLedger !== null && indexer.gapToLedger !== null;
  const missingLedgers = hasBounds
    ? // Inclusive range, hence the +1.
      (indexer.gapToLedger as number) - (indexer.gapFromLedger as number) + 1
    : null;

  return (
    <Notification variant="warning" title="Some of this vault's history is missing" isFilled>
      <div>
        <p>
          {hasBounds ? (
            <>
              Events between ledger <strong>{indexer.gapFromLedger?.toLocaleString()}</strong> and
              ledger <strong>{indexer.gapToLedger?.toLocaleString()}</strong> were never read
              {missingLedgers !== null
                ? ` — a gap of ${missingLedgers.toLocaleString()} ledgers`
                : ""}
              . Stellar RPC only keeps about seven days of events, and this range had already aged
              out before it could be indexed, so it cannot be recovered.
            </>
          ) : (
            <>
              Part of this vault&apos;s event history could not be read before it aged out of
              Stellar RPC&apos;s retention window, so it cannot be recovered.
            </>
          )}
        </p>
        <p>
          <strong>Balances and allocation amounts are still correct</strong> — those come from the
          contract itself. What may be incomplete is the activity history: an allocation registered
          or claimed inside that range may be missing from the list below, or show a status that
          never got its update.
        </p>
        {indexer.degradedReason ? <p>Reported reason: {indexer.degradedReason}</p> : null}
      </div>
    </Notification>
  );
};

/** One message per non-ok reason. `none` renders nothing. */
const HealthNotice = ({ health }: { health: IndexerHealth }) => {
  switch (health.reason) {
    case "lag_over_threshold":
      return (
        <Notification variant="warning" title="This data is catching up" isFilled={false}>
          The indexer is <strong>{formatLag(health.lagLedgers, health.lagSecondsEstimate)}</strong>{" "}
          behind the network, so a recent fund, registration or claim may not appear yet. Retention
          headroom:{" "}
          {health.retentionHeadroom === null
            ? "unknown"
            : `${formatCount(health.retentionHeadroom)} ledgers`}{" "}
          before unread events start aging out of Stellar RPC.
        </Notification>
      );
    case "no_recent_commit":
      return (
        <Notification variant="warning" title="The indexer has stopped updating" isFilled={false}>
          No new data has been committed recently, so the figures on this page are as of the last
          successful update and will not change until the indexer resumes.
        </Notification>
      );
    case "rpc_unreachable":
      return (
        <Notification variant="warning" title="Stellar RPC cannot be reached" isFilled={false}>
          The backend cannot reach Stellar RPC, so how far behind this data is is unknown. The
          figures on this page may be out of date.
        </Notification>
      );
    case "never_indexed":
      return (
        <Notification variant="primary" title="First sync pending" isFilled={false}>
          The indexer has not finished its first pass over this vault yet, so the figures below may
          be incomplete. If this does not change after a few minutes, the indexer may not be
          running.
        </Notification>
      );
    default:
      return null;
  }
};

/**
 * `indexer` is optional so the banner can still report live health when the
 * overview (its only source) failed to load — e.g. "Vault has not been
 * indexed yet" while the indexer is also stalled.
 */
export const IndexerStatusBanner = ({
  indexer,
  health,
}: {
  indexer?: IndexerStatus;
  health?: VaultStatusView;
}) => (
  <>
    {indexer?.isDegraded ? <DegradedHistoryNotice indexer={indexer} /> : null}
    {health?.state === "ready" ? <HealthNotice health={health.health} /> : null}
  </>
);
