import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecipientsTable } from "@/components/Vault/RecipientsTable";

import type { VaultAllocation } from "@/types/vault";

const RECIPIENT = "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX";

const allocation = (overrides: Partial<VaultAllocation> = {}): VaultAllocation => ({
  recipient: RECIPIENT,
  amount: BigInt("250000000"),
  status: "PENDING",
  registeredAt: new Date("2026-11-01T00:00:00Z"),
  registeredLedger: 10,
  settledAt: null,
  settledLedger: null,
  ...overrides,
});

const renderTable = (props: Partial<React.ComponentProps<typeof RecipientsTable>> = {}) => {
  const onCancel = vi.fn();

  render(
    <RecipientsTable
      allocations={[allocation()]}
      isLoading={false}
      error={null}
      canCancel={false}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onCancel };
};

describe("RecipientsTable", () => {
  it("announces the loading state to assistive technology", () => {
    renderTable({ isLoading: true, allocations: [] });

    expect(screen.getByText(/loading recipients/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains an empty vault instead of showing a bare table", () => {
    renderTable({ allocations: [] });

    expect(screen.getByText(/no recipients yet/i)).toBeInTheDocument();
    expect(screen.getByText(/once an allocation is registered/i)).toBeInTheDocument();
  });

  it("surfaces a load failure with the server's message", () => {
    renderTable({ allocations: [], error: { message: "Vault is not indexed yet." } });

    expect(screen.getByText(/could not load recipients/i)).toBeInTheDocument();
    expect(screen.getByText("Vault is not indexed yet.")).toBeInTheDocument();
  });

  it("shows the amount and keeps the full address available", () => {
    renderTable();

    // stroopsToUnits trims trailing zeros, so 250000000 stroops reads as "25".
    expect(screen.getByText("25")).toBeInTheDocument();
    // The address is truncated for display but recoverable via the title.
    expect(screen.getByTitle(RECIPIENT)).toBeInTheDocument();
  });

  it.each([
    ["PENDING", "Unclaimed"],
    ["CLAIMED", "Claimed"],
    ["CANCELLED", "Cancelled"],
  ] as const)("labels a %s allocation as %s", (status, label) => {
    renderTable({ allocations: [allocation({ status })] });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  describe("cancelling", () => {
    it("offers no cancel control when cancelling is not permitted", () => {
      renderTable({
        canCancel: false,
        cancelBlockedReason: "Only after the claim deadline.",
      });

      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText(/only after the claim deadline/i)).toBeInTheDocument();
    });

    it("names the recipient in the button's accessible label", async () => {
      renderTable({ canCancel: true });

      expect(
        screen.getByRole("button", { name: `Cancel the allocation for ${RECIPIENT}` }),
      ).toBeInTheDocument();
    });

    it("passes the chosen allocation to the handler", async () => {
      const user = userEvent.setup();
      const { onCancel } = renderTable({ canCancel: true });

      await user.click(screen.getByRole("button", { name: /cancel the allocation/i }));

      expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ recipient: RECIPIENT }));
    });

    // Only a PENDING allocation can be cancelled; the contract rejects the
    // others, so offering the control would invite a guaranteed failure.
    it.each(["CLAIMED", "CANCELLED"] as const)(
      "offers no cancel control for a %s allocation",
      (status) => {
        renderTable({ canCancel: true, allocations: [allocation({ status })] });

        expect(
          screen.queryByRole("button", { name: /cancel the allocation/i }),
        ).not.toBeInTheDocument();
      },
    );
  });
});
