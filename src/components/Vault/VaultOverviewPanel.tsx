import { Card, CopyText } from "@stellar/design-system";

import { stroopsToUnits, truncateAddress } from "@/helpers/vault";

import type { VaultOverview } from "@/types/vault";

import "./VaultOverviewPanel.scss";

/**
 * The vault's balances and configuration.
 *
 * `balance` is everything the contract holds; `total_allocated` is the part
 * already earmarked for recipients who have not claimed; `available` is what
 * the admin can still withdraw. Showing all three together is deliberate —
 * the invariant that matters (allocations are fully backed) is only legible
 * when they are side by side.
 */
export const VaultOverviewPanel = ({ overview }: { overview: VaultOverview }) => {
  const figures: { label: string; value: string; note: string; testId?: string }[] = [
    {
      label: "Balance",
      value: stroopsToUnits(overview.balance),
      note: "Everything the vault holds",
      // The end-to-end test asserts this figure changes after funding.
      testId: "vault-balance",
    },
    {
      label: "Allocated",
      value: stroopsToUnits(overview.totalAllocated),
      note: "Reserved for unclaimed recipients",
    },
    {
      label: "Claimed",
      value: stroopsToUnits(overview.totalClaimed),
      note: "Collected by recipients so far",
    },
    {
      label: "Available",
      // Null means the backend could not read it; an em dash is honest where
      // a zero would be a false statement about withdrawable funds.
      value: overview.available === null ? "—" : stroopsToUnits(overview.available),
      note: "Withdrawable by the admin",
    },
  ];

  return (
    <Card>
      <h3>Vault</h3>

      {/* A <div>, not a <p>: the design system's theme sizes every <p> as body
          text with a more specific selector, which would override this
          deliberately quiet note. */}
      {overview.source === "snapshot" ? (
        <div className="VaultOverviewPanel__source">
          {overview.bootstrapLedger === null
            ? "Summary read from the contract."
            : `Summary read from the contract at ledger ${overview.bootstrapLedger.toLocaleString()}.`}
        </div>
      ) : null}

      <dl className="VaultFigures">
        {figures.map((figure) => (
          <div key={figure.label} className="VaultFigures__item">
            <dt>{figure.label}</dt>
            <dd>
              <strong className="VaultFigures__value" data-testid={figure.testId}>
                {figure.value}
              </strong>
              {/* Value and note are stacked by CSS; this space keeps them two
                  words for screen readers, which read the text, not the layout. */}{" "}
              <span className="VaultFigures__note">{figure.note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="VaultMeta">
        <div className="VaultMeta__row">
          <dt>Contract</dt>
          <dd>
            <CopyText textToCopy={overview.contractId}>
              <span title={overview.contractId}>{truncateAddress(overview.contractId, 6)}</span>
            </CopyText>
          </dd>
        </div>
        <div className="VaultMeta__row">
          <dt>Admin</dt>
          <dd>
            <CopyText textToCopy={overview.admin}>
              <span title={overview.admin}>{truncateAddress(overview.admin, 6)}</span>
            </CopyText>
          </dd>
        </div>
        <div className="VaultMeta__row">
          <dt>Token</dt>
          <dd>
            <CopyText textToCopy={overview.token}>
              <span title={overview.token}>{truncateAddress(overview.token, 6)}</span>
            </CopyText>
          </dd>
        </div>
      </dl>
    </Card>
  );
};
