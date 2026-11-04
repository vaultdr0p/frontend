import { Button, Modal, Notification } from "@stellar/design-system";

import type { VaultTransactionPhase } from "@/apiQueries/useVaultTransaction";

import type { BuildTransactionResult, VaultOperation } from "@/types/vault";

/**
 * Shows what is about to be signed, then signs it.
 *
 * The summary is the backend's, derived from the same values it encoded into
 * the envelope, so what the signer reads cannot drift from what they sign.
 * This dialog never constructs its own description of the operation.
 *
 * Secret keys do not appear in this flow at any point: the XDR goes to the
 * wallet extension and a signed envelope comes back. A user declining in the
 * extension is a normal outcome and is reported as such, not as an error.
 */

const OPERATION_TITLE: Record<VaultOperation, string> = {
  fund: "Review funding",
  register: "Review registration",
  cancel: "Review cancellation",
  withdraw: "Review withdrawal",
};

export const SignTransactionDialog = ({
  prepared,
  phase,
  error,
  wasRejected,
  txHash,
  onConfirm,
  onClose,
}: {
  prepared: BuildTransactionResult | null;
  phase: VaultTransactionPhase;
  error: string | null;
  wasRejected: boolean;
  txHash: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const isOpen = phase !== "idle" && phase !== "preparing";
  const isBusy = phase === "signing" || phase === "submitting";
  const isDone = phase === "success";

  return (
    <Modal visible={isOpen} onClose={isBusy ? () => undefined : onClose}>
      <Modal.Heading>
        {isDone
          ? "Done"
          : prepared
            ? OPERATION_TITLE[prepared.operation]
            : "Review this transaction"}
      </Modal.Heading>

      <Modal.Body>
        {/* Status changes are announced rather than only shown, since the
            signing step hands control to an extension outside this page. */}
        <div aria-live="polite">
          {phase === "signing" ? <p>Waiting for you to approve this in your wallet…</p> : null}
          {phase === "submitting" ? <p>Submitting to the network…</p> : null}
        </div>

        {isDone ? (
          <>
            <Notification variant="success" title="Transaction confirmed" isFilled={false}>
              The network accepted this transaction.
            </Notification>
            {txHash ? (
              <p>
                Transaction hash: <code>{txHash}</code>
              </p>
            ) : null}
            <p>
              The list updates once the indexer has read the new events, which usually takes a few
              seconds.
            </p>
          </>
        ) : null}

        {error ? (
          <Notification
            variant={wasRejected ? "warning" : "error"}
            title={wasRejected ? "Rejected in your wallet" : "This did not go through"}
            isFilled
          >
            {wasRejected
              ? "You declined the request, so nothing was signed or submitted. You can try again whenever you are ready."
              : error}
          </Notification>
        ) : null}

        {prepared && !isDone ? (
          <dl className="VaultSummary">
            {prepared.summary.map((row) => (
              <div key={row.label} className="VaultSummary__row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
            {prepared.minResourceFee ? (
              <div className="VaultSummary__row">
                <dt>Estimated resource fee</dt>
                <dd>{prepared.minResourceFee} stroops</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {prepared && !isDone ? (
          <p>
            Signing happens in your wallet extension. This dashboard never sees your secret key.
          </p>
        ) : null}
      </Modal.Body>

      <Modal.Footer>
        {isDone ? (
          <Button variant="primary" size="md" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="tertiary" size="md" onClick={onClose} disabled={isBusy}>
              {error ? "Close" : "Back"}
            </Button>
            {prepared ? (
              <Button variant="primary" size="md" onClick={onConfirm} isLoading={isBusy}>
                {error ? "Try again" : "Sign in wallet"}
              </Button>
            ) : null}
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
};
