import { useState } from "react";

import { Button, Card, Loader, Notification } from "@stellar/design-system";

import { ClaimDeadline } from "@/components/Vault/ClaimDeadline";
import { ConfirmCancelDialog } from "@/components/Vault/ConfirmCancelDialog";
import { FundVaultForm } from "@/components/Vault/FundVaultForm";
import { IndexerStatusBanner } from "@/components/Vault/IndexerStatusBanner";
import { RecipientsTable } from "@/components/Vault/RecipientsTable";
import { SignTransactionDialog } from "@/components/Vault/SignTransactionDialog";
import { VaultOverviewPanel } from "@/components/Vault/VaultOverviewPanel";
import { VaultStatusIndicator } from "@/components/Vault/VaultStatusIndicator";

import { vaultContractId } from "@/constants/vault";

import { useVaultAllocations } from "@/apiQueries/useVaultAllocations";
import { useVaultOverview } from "@/apiQueries/useVaultOverview";
import { useVaultStatus } from "@/apiQueries/useVaultStatus";
import { useVaultTransaction } from "@/apiQueries/useVaultTransaction";

import { isFullyIndexed, isVaultNotIndexedError } from "@/helpers/vaultApi";

import { useVaultWallet } from "@/hooks/useVaultWallet";

import type { VaultAllocation } from "@/types/vault";

/**
 * The disbursement vault dashboard.
 *
 * Every figure on this page comes from the backend's vault endpoints, which
 * index the contract's events. The page therefore always shows the indexer's
 * health alongside the data, because a number that is minutes stale, or drawn
 * from an incomplete history, should not look identical to a fresh one.
 */
export const Vault = () => {
  const contractId = vaultContractId;

  const [allocationToCancel, setAllocationToCancel] = useState<VaultAllocation | null>(null);

  const wallet = useVaultWallet();
  const overviewQuery = useVaultOverview(contractId);
  const statusView = useVaultStatus(contractId);
  const allocationsQuery = useVaultAllocations(contractId);
  const transaction = useVaultTransaction(contractId);

  const overview = overviewQuery.data;
  const isAdmin = Boolean(wallet.address && overview && wallet.address === overview.admin);
  const isBusy = transaction.phase === "preparing" || transaction.phase === "signing";

  if (!contractId) {
    return (
      <Notification variant="warning" title="No vault configured" isFilled>
        This deployment has no vault contract id set, so there is nothing to show. Set
        <code> VAULT_CONTRACT_ID</code> to enable this page.
      </Notification>
    );
  }

  // The indexer status is shown even when the overview cannot be read: a
  // vault that fails to load is exactly when "is the indexer running?" is
  // the question an operator needs answered.
  if (overviewQuery.isLoading) {
    return (
      <div className="VaultPage">
        <VaultStatusIndicator view={statusView} />
        <div aria-live="polite" aria-busy="true">
          <Loader size="2rem" />
          <span>Loading vault…</span>
        </div>
      </div>
    );
  }

  // Not an error the operator can fix from here, and the allocations endpoint
  // does not depend on the overview, so this is a neutral notice with the
  // allocations still listed. Deliberately no cause in the UI: it has not been
  // verified for any given vault. Everything that needs the overview (balances,
  // deadline, admin wallet, funding, cancelling) is left out.
  if (isVaultNotIndexedError(overviewQuery.error)) {
    return (
      <div className="VaultPage">
        <h1>Disbursement vault</h1>
        <VaultStatusIndicator view={statusView} />
        <IndexerStatusBanner health={statusView} />
        <Notification variant="primary" title="Vault not indexed" isFilled={false}>
          This vault hasn&apos;t been indexed yet, so its balances and details can&apos;t be shown.
          Recipient allocations are listed below. If this doesn&apos;t change, contact your
          administrator.
        </Notification>
        <RecipientsTable
          allocations={allocationsQuery.data?.allocations ?? []}
          isLoading={allocationsQuery.isLoading}
          error={allocationsQuery.error ?? null}
          canCancel={false}
          cancelBlockedReason="Allocations can't be cancelled until this vault has been indexed."
          onCancel={() => undefined}
          // An empty list here is not evidence that nobody was registered.
          emptyMessage="No allocations have been indexed for this vault yet."
        />
      </div>
    );
  }

  if (overviewQuery.error || !overview) {
    return (
      <div className="VaultPage">
        <VaultStatusIndicator view={statusView} />
        <IndexerStatusBanner health={statusView} />
        <Notification variant="error" title="Could not load this vault" isFilled>
          {overviewQuery.error?.message ??
            "The vault could not be read. It may not be indexed yet, or the vault feature may be disabled on the server."}
        </Notification>
      </div>
    );
  }

  const handleCancelConfirmed = (allocation: VaultAllocation) => {
    setAllocationToCancel(null);
    void transaction.prepare({ operation: "cancel", recipient: allocation.recipient });
  };

  return (
    <div className="VaultPage">
      <h1>Disbursement vault</h1>

      <VaultStatusIndicator view={statusView} />

      <IndexerStatusBanner indexer={overview.indexer} health={statusView} />

      {!wallet.isConnected ? (
        <Card>
          <div className="VaultConnect">
            <p>
              Connect the admin wallet to add funds or cancel allocations. You can read everything
              on this page without connecting.
            </p>
            <Button
              variant="primary"
              size="md"
              onClick={() => void wallet.connect()}
              isLoading={wallet.isConnecting}
            >
              Connect Freighter
            </Button>
            {wallet.connectError ? (
              <Notification variant="error" title="Could not connect" isFilled={false}>
                {wallet.connectError}
              </Notification>
            ) : null}
          </div>
        </Card>
      ) : null}

      {wallet.networkMismatch ? (
        <Notification variant="warning" title="Wrong network selected" isFilled>
          Your wallet is on {wallet.networkMismatch.walletNetwork}, but this vault is on{" "}
          {wallet.networkMismatch.expected}. Switch networks in Freighter before signing anything.
        </Notification>
      ) : null}

      <div className="VaultPage__grid">
        <VaultOverviewPanel overview={overview} />
        <ClaimDeadline deadline={overview.deadline} isExpired={overview.isExpired} />
      </div>

      <FundVaultForm
        isBusy={isBusy}
        isDisabled={!isAdmin || Boolean(wallet.networkMismatch)}
        disabledReason={
          !wallet.isConnected
            ? "Connect the admin wallet to add funds."
            : !isAdmin
              ? "Only the vault's admin account can add funds."
              : undefined
        }
        onSubmit={(amountStroops) =>
          void transaction.prepare({ operation: "fund", amount: amountStroops })
        }
      />

      <RecipientsTable
        allocations={allocationsQuery.data?.allocations ?? []}
        isLoading={allocationsQuery.isLoading}
        error={allocationsQuery.error ?? null}
        canCancel={isAdmin && overview.isExpired && !wallet.networkMismatch}
        cancelBlockedReason={
          !overview.isExpired
            ? "Allocations can only be cancelled once the claim deadline has passed."
            : !isAdmin
              ? "Only the vault's admin account can cancel an allocation."
              : undefined
        }
        onCancel={setAllocationToCancel}
        // An empty list proves nobody was registered only when the indexed
        // history is complete; otherwise say what it does and does not show.
        emptyMessage={
          isFullyIndexed(overview)
            ? undefined
            : "Recipients registered before indexing began can't be listed. New registrations will appear here."
        }
      />

      <ConfirmCancelDialog
        allocation={allocationToCancel}
        isBusy={isBusy}
        onConfirm={handleCancelConfirmed}
        onClose={() => setAllocationToCancel(null)}
      />

      <SignTransactionDialog
        prepared={transaction.prepared}
        phase={transaction.phase}
        error={transaction.error}
        wasRejected={transaction.wasRejected}
        txHash={transaction.txHash}
        onConfirm={() => void transaction.confirm()}
        onClose={transaction.reset}
      />
    </div>
  );
};
