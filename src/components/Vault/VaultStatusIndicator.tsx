import { useEffect, useState } from "react";

import { Icon } from "@stellar/design-system";

import type { VaultStatusView } from "@/apiQueries/useVaultStatus";

import {
  VAULT_STATUS_LABELS,
  VAULT_STATUS_REASON_TEXT,
  formatCheckedAgo,
  formatCount,
  formatLag,
  vaultStatusKind,
  type VaultStatusKind,
} from "@/helpers/vaultStatus";

import "./VaultStatusIndicator.scss";

/** Icon per kind. Decorative: the label beside it always carries the meaning. */
const ICONS: Record<VaultStatusKind, typeof Icon.CheckCircle> = {
  loading: Icon.Hourglass01,
  healthy: Icon.CheckCircle,
  lagging: Icon.AlertTriangle,
  stalled: Icon.PauseCircle,
  first_sync: Icon.Hourglass01,
  unavailable: Icon.HelpCircle,
};

/** Re-renders every `intervalMs` so relative times stay current. */
const useNow = (intervalMs: number): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

/**
 * A compact, always-visible readout of the vault indexer's live health.
 *
 * Accessibility:
 * - State is conveyed by text and an icon, never by colour alone; the icon is
 *   `aria-hidden` because the text already says the same thing.
 * - Only the label and one reason sentence sit inside `role="status"` (a
 *   polite live region), so a screen reader announces a *change of state*.
 *   The numbers and the "checked N s ago" text sit outside it; inside, they
 *   would be re-announced on every poll and every clock tick.
 */
export const VaultStatusIndicator = ({ view }: { view: VaultStatusView }) => {
  const now = useNow(1_000);
  const kind = vaultStatusKind(view);
  const StatusIcon = ICONS[kind];
  const health = view.state === "ready" ? view.health : null;

  return (
    <section className="VaultStatusIndicator" aria-label="Indexer status" data-kind={kind}>
      <div role="status" className="VaultStatusIndicator__summary">
        <StatusIcon aria-hidden="true" focusable="false" />
        <span className="VaultStatusIndicator__label">Indexer: {VAULT_STATUS_LABELS[kind]}</span>
        {/* The {" "} keeps the spoken text "Stalled The indexer…" rather than
            "StalledThe indexer…"; flex gap only adds visual space. */}
        {health ? (
          <span className="VaultStatusIndicator__reason">
            {" "}
            {VAULT_STATUS_REASON_TEXT[health.reason]}
          </span>
        ) : null}
        {kind === "unavailable" ? (
          <span className="VaultStatusIndicator__reason">
            {" "}
            The status check itself failed, so the indexer&apos;s health is not known.
          </span>
        ) : null}
      </div>

      {health ? (
        <dl className="VaultStatusIndicator__details">
          <div>
            <dt>Lag</dt>
            <dd data-testid="vault-status-lag">
              {formatLag(health.lagLedgers, health.lagSecondsEstimate)}
            </dd>
          </div>
          <div>
            <dt>Retention headroom</dt>
            <dd data-testid="vault-status-headroom">
              {health.retentionHeadroom === null
                ? "unknown"
                : `${formatCount(health.retentionHeadroom)} ledgers`}
            </dd>
          </div>
          <div>
            <dt>Last event</dt>
            <dd data-testid="vault-status-last-event">
              {health.lastEventAt ? health.lastEventAt.toLocaleString() : "none yet"}
            </dd>
          </div>
          <div>
            <dt>Checked</dt>
            <dd data-testid="vault-status-checked">
              <time dateTime={health.checkedAt.toISOString()}>
                {formatCheckedAgo(health.checkedAt, now)}
              </time>
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
};
