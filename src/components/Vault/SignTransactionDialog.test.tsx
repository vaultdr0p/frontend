import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignTransactionDialog } from "@/components/Vault/SignTransactionDialog";

import type { BuildTransactionResult } from "@/types/vault";

const prepared: BuildTransactionResult = {
  xdr: "AAAAAgAAAA…",
  networkPassphrase: "Test SDF Network ; September 2015",
  operation: "fund",
  minResourceFee: "12345",
  summary: [
    { label: "Effect", value: "Fund the vault with 100.0000000" },
    { label: "Amount", value: "1000000000" },
  ],
};

const renderDialog = (props: Partial<React.ComponentProps<typeof SignTransactionDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  render(
    <SignTransactionDialog
      prepared={prepared}
      phase="review"
      error={null}
      wasRejected={false}
      txHash={null}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
};

describe("SignTransactionDialog", () => {
  it("stays closed while idle", () => {
    renderDialog({ phase: "idle" });

    expect(screen.queryByText(/sign in wallet/i)).not.toBeInTheDocument();
  });

  it("shows the backend's summary, effect first", () => {
    renderDialog();

    expect(screen.getByText("Effect")).toBeInTheDocument();
    expect(screen.getByText("Fund the vault with 100.0000000")).toBeInTheDocument();
    expect(screen.getByText(/12345 stroops/)).toBeInTheDocument();
  });

  it("tells the signer their key never leaves the wallet", () => {
    renderDialog();

    expect(screen.getByText(/never sees your secret key/i)).toBeInTheDocument();
  });

  it("signs when confirmed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: /sign in wallet/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("announces that it is waiting on the wallet", () => {
    renderDialog({ phase: "signing" });

    expect(screen.getByText(/waiting for you to approve/i)).toBeInTheDocument();
  });

  it("blocks closing while a signature or submission is in flight", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ phase: "submitting" });

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(onClose).not.toHaveBeenCalled();
  });

  // A decline is a normal outcome, not a fault, and must not look like a bug.
  it("treats a wallet rejection as a neutral outcome", () => {
    renderDialog({
      phase: "error",
      error: "Request was rejected in the wallet.",
      wasRejected: true,
    });

    expect(screen.getByText(/rejected in your wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was signed or submitted/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows a real failure as an error with its message", () => {
    renderDialog({
      phase: "error",
      error: "The network rejected this transaction.",
      wasRejected: false,
    });

    expect(screen.getByText(/this did not go through/i)).toBeInTheDocument();
    expect(screen.getByText("The network rejected this transaction.")).toBeInTheDocument();
  });

  it("reports success with the transaction hash", () => {
    renderDialog({ phase: "success", txHash: "abc123" });

    expect(screen.getByText(/transaction confirmed/i)).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    // The summary is no longer the point once it has succeeded.
    expect(screen.queryByText(/sign in wallet/i)).not.toBeInTheDocument();
  });
});
