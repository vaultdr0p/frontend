import { Button, Modal } from "@stellar/design-system";

import { stroopsToUnits } from "@/helpers/vault";

import type { VaultAllocation } from "@/types/vault";

/**
 * Confirms cancelling one recipient's unclaimed allocation.
 *
 * Cancelling is not destructive on-chain — it moves no tokens, it releases the
 * encumbrance so the admin can withdraw again — but it does take away a
 * recipient's claim, and it cannot be undone from this UI because `register`
 * rejects a recipient who already has an allocation. So the dialog names the
 * recipient and the amount rather than asking "are you sure?", and says what
 * will and will not happen.
 */
export const ConfirmCancelDialog = ({
  allocation,
  isBusy,
  onConfirm,
  onClose,
}: {
  /** Null closes the dialog; non-null is the allocation under consideration. */
  allocation: VaultAllocation | null;
  isBusy: boolean;
  onConfirm: (allocation: VaultAllocation) => void;
  onClose: () => void;
}) => (
  <Modal visible={Boolean(allocation)} onClose={onClose}>
    <Modal.Heading>Cancel this allocation?</Modal.Heading>

    <Modal.Body>
      {allocation ? (
        <>
          <p>
            This releases <strong>{stroopsToUnits(allocation.amount)}</strong> earmarked for:
          </p>
          <p>
            <code>{allocation.recipient}</code>
          </p>
          <p>
            That recipient will no longer be able to claim. No tokens move — the amount simply stops
            being reserved, so it becomes withdrawable again.
          </p>
          <p>
            You will be asked to review and sign this in your wallet. Nothing changes until you do.
          </p>
        </>
      ) : null}
    </Modal.Body>

    <Modal.Footer>
      <Button variant="tertiary" size="md" onClick={onClose} disabled={isBusy}>
        Keep allocation
      </Button>
      <Button
        variant="destructive"
        size="md"
        isLoading={isBusy}
        onClick={() => {
          if (allocation) {
            onConfirm(allocation);
          }
        }}
      >
        Cancel allocation
      </Button>
    </Modal.Footer>
  </Modal>
);
