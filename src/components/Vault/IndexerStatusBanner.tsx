import { Notification } from "@stellar/design-system";

import type { IndexerStatus } from "@/types/vault";

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
 */

/** Roughly five seconds per ledger, so this is a readable approximation. */
const LEDGER_SECONDS = 5;

export const describeLag = (lagLedgers: number): string => {
  if (lagLedgers <= 1) {
    return "up to date";
  }
  const seconds = lagLedgers * LEDGER_SECONDS;

  if (seconds < 90) {
    return `about ${seconds} seconds behind`;
  }
  const minutes = Math.round(seconds / 60);

  if (minutes < 90) {
    return `about ${minutes} minute${minutes === 1 ? "" : "s"} behind`;
  }
  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `about ${hours} hour${hours === 1 ? "" : "s"} behind`;
  }
  return `about ${Math.round(hours / 24)} days behind`;
};

/** A gap of this many ledgers or more is worth calling out on its own. */
const LAG_WARNING_LEDGERS = 120;

export const IndexerStatusBanner = ({ indexer }: { indexer: IndexerStatus }) => {
  if (indexer.isDegraded) {
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
            contract itself. What may be incomplete is the activity history: an allocation
            registered or claimed inside that range may be missing from the list below, or show a
            status that never got its update.
          </p>
          {indexer.degradedReason ? <p>Reported reason: {indexer.degradedReason}</p> : null}
        </div>
      </Notification>
    );
  }

  if (indexer.lagLedgers >= LAG_WARNING_LEDGERS) {
    return (
      <Notification variant="primary" title="This data is catching up" isFilled={false}>
        The indexer is {describeLag(indexer.lagLedgers)} ({indexer.lagLedgers.toLocaleString()}{" "}
        ledgers). A recent fund, registration or claim may not appear yet.
      </Notification>
    );
  }

  return null;
};
