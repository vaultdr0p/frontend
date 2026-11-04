import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmCancelDialog } from "@/components/Vault/ConfirmCancelDialog";

import type { VaultAllocation } from "@/types/vault";

const RECIPIENT = "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX";

const allocation: VaultAllocation = {
  recipient: RECIPIENT,
  amount: BigInt("250000000"),
  status: "PENDING",
  registeredAt: new Date("2026-11-01T00:00:00Z"),
  registeredLedger: 10,
  settledAt: null,
  settledLedger: null,
};

const renderDialog = (props: Partial<React.ComponentProps<typeof ConfirmCancelDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  render(
    <ConfirmCancelDialog
      allocation={allocation}
      isBusy={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
};

describe("ConfirmCancelDialog", () => {
  it("is closed when there is no allocation under consideration", () => {
    renderDialog({ allocation: null });

    expect(screen.queryByRole("button", { name: /cancel allocation/i })).not.toBeInTheDocument();
  });

  // A confirmation that only asks "are you sure?" gives the operator nothing
  // to check. The recipient and amount are the facts they need.
  it("names the recipient and the amount at stake", () => {
    renderDialog();

    expect(screen.getByText(RECIPIENT)).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("says what will and will not happen", () => {
    renderDialog();

    expect(screen.getByText(/no longer be able to claim/i)).toBeInTheDocument();
    expect(screen.getByText(/no tokens move/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing changes until you do/i)).toBeInTheDocument();
  });

  it("confirms with the allocation", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: /^cancel allocation$/i }));

    expect(onConfirm).toHaveBeenCalledWith(allocation);
  });

  it("offers a way out that does not cancel", async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: /keep allocation/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("can be dismissed with Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("disables the way out while the request is in flight", () => {
    renderDialog({ isBusy: true });

    expect(screen.getByRole("button", { name: /keep allocation/i })).toBeDisabled();
  });
});
