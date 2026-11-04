import { useState } from "react";

import { Button, Card, Loader, Notification } from "@stellar/design-system";

import { ClaimDeadline } from "@/components/Vault/ClaimDeadline";
import { ConfirmCancelDialog } from "@/components/Vault/ConfirmCancelDialog";
import { FundVaultForm } from "@/components/Vault/FundVaultForm";
import { IndexerStatusBanner } from "@/components/Vault/IndexerStatusBanner";
import { RecipientsTable } from "@/components/Vault/RecipientsTable";
import { SignTransactionDialog } from "@/components/Vault/SignTransactionDialog";
import { VaultOverviewPanel } from "@/components/Vault/VaultOverviewPanel";

import { vaultContractId } from "@/constants/vault";

import { useVaultAllocations } from "@/apiQueries/useVaultAllocations";
import { useVaultOverview } from "@/apiQueries/useVaultOverview";
import { useVaultTransaction } from "@/apiQueries/useVaultTransaction";

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

  if (overviewQuery.isLoading) {
    return (
      <div aria-live="polite" aria-busy="true">
        <Loader size="2rem" />
        <span>Loading vault…</span>
      </div>
    );
  }

  if (overviewQuery.error || !overview) {
    return (
      <Notification variant="error" title="Could not load this vault" isFilled>
        {overviewQuery.error?.message ??
          "The vault could not be read. It may not be indexed yet, or the vault feature may be disabled on the server."}
      </Notification>
    );
  }

  const handleCancelConfirmed = (allocation: VaultAllocation) => {
    setAllocationToCancel(null);
    void transaction.prepare({ operation: "cancel", recipient: allocation.recipient });
  };

  return (
    <div className="VaultPage">
      <h1>Disbursement vault</h1>

      <IndexerStatusBanner indexer={overview.indexer} />

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
