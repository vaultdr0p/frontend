import { Badge, Button, Card, Loader, Notification } from "@stellar/design-system";

import { stroopsToUnits, truncateAddress } from "@/helpers/vault";

import type { AllocationStatus, VaultAllocation } from "@/types/vault";

import type { AppError } from "@/types";

/**
 * The vault's recipients and the state of each allocation.
 *
 * The list comes from the backend, which indexes `registered` events — the
 * contract itself cannot enumerate recipients. That is why this replaced a
 * per-browser local-storage list: this table is the same for every operator
 * and includes recipients registered outside this dashboard.
 */

const STATUS_VARIANT: Record<AllocationStatus, "warning" | "success" | "secondary"> = {
  PENDING: "warning",
  CLAIMED: "success",
  CANCELLED: "secondary",
};

const STATUS_LABEL: Record<AllocationStatus, string> = {
  PENDING: "Unclaimed",
  CLAIMED: "Claimed",
  CANCELLED: "Cancelled",
};

export const RecipientsTable = ({
  allocations,
  isLoading,
  error,
  canCancel,
  cancelBlockedReason,
  onCancel,
}: {
  allocations: VaultAllocation[];
  isLoading: boolean;
  error: AppError | null;
  /** Cancel is only legal at or after the deadline, and only for the admin. */
  canCancel: boolean;
  cancelBlockedReason?: string;
  onCancel: (allocation: VaultAllocation) => void;
}) => {
  if (isLoading) {
    return (
      <Card>
        <div aria-live="polite" aria-busy="true">
          <Loader size="1.5rem" />
          <span>Loading recipients…</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Notification variant="error" title="Could not load recipients" isFilled>
          {error.message}
        </Notification>
      </Card>
    );
  }

  if (allocations.length === 0) {
    return (
      <Card>
        <div className="VaultRecipients__empty">
          <h3>No recipients yet</h3>
          <p>
            Nobody has been registered for this vault. Once an allocation is registered on-chain, it
            appears here with its claim status.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <table className="Table">
        <caption className="Table__caption">
          Recipients and allocations for this vault, newest first
        </caption>
        <thead>
          <tr>
            <th scope="col">Recipient</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Registered</th>
            {canCancel ? (
              <th scope="col">
                <span className="Table__srOnly">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => (
            <tr key={allocation.recipient}>
              <th scope="row">
                {/* Full address in the title so a truncated value is still verifiable. */}
                <span title={allocation.recipient}>{truncateAddress(allocation.recipient, 6)}</span>
              </th>
              <td>{stroopsToUnits(allocation.amount)}</td>
              <td>
                <Badge variant={STATUS_VARIANT[allocation.status]} size="sm" isStatus>
                  {STATUS_LABEL[allocation.status]}
                </Badge>
              </td>
              <td>
                <time dateTime={allocation.registeredAt.toISOString()}>
                  {allocation.registeredAt.toLocaleDateString()}
                </time>
              </td>
              {canCancel ? (
                <td>
                  {allocation.status === "PENDING" ? (
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => onCancel(allocation)}
                      // The accessible name says which recipient, so the
                      // button is unambiguous out of its row context.
                      aria-label={`Cancel the allocation for ${allocation.recipient}`}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {!canCancel && cancelBlockedReason ? <p role="note">{cancelBlockedReason}</p> : null}
    </Card>
  );
};
