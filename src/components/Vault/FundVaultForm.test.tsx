import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FundVaultForm } from "@/components/Vault/FundVaultForm";

const renderForm = (overrides: Partial<React.ComponentProps<typeof FundVaultForm>> = {}) => {
  const onSubmit = vi.fn();

  render(<FundVaultForm onSubmit={onSubmit} isBusy={false} isDisabled={false} {...overrides} />);
  return { onSubmit };
};

describe("FundVaultForm", () => {
  it("labels the amount field so it is reachable by its accessible name", () => {
    renderForm();

    // getByLabelText only passes if the label is actually associated with the
    // input, which is the property a screen reader depends on.
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
  });

  it("submits the amount converted to stroops", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/amount/i), "100.5");
    await user.click(screen.getByRole("button", { name: /review funding/i }));

    // 100.5 units = 1_005_000_000 stroops, as an exact bigint.
    expect(onSubmit).toHaveBeenCalledWith(BigInt("1005000000"));
  });

  // The precision case that motivates the string/bigint handling: this value
  // is not exactly representable as an IEEE-754 double.
  it("converts a 7-decimal amount without rounding", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/amount/i), "0.1234567");
    await user.click(screen.getByRole("button", { name: /review funding/i }));

    expect(onSubmit).toHaveBeenCalledWith(BigInt("1234567"));
  });

  it("rejects more decimals than the asset supports, and does not submit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/amount/i), "1.12345678");
    await user.click(screen.getByRole("button", { name: /review funding/i }));

    expect(screen.getByText(/at most 7 decimal places/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty amount", "", /amount is required/i],
    ["text", "abc", /enter a number/i],
    ["zero", "0", /greater than zero/i],
  ])("rejects %s", async (_label, value, expected) => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    if (value) {
      await user.type(screen.getByLabelText(/amount/i), value);
    }
    await user.click(screen.getByRole("button", { name: /review funding/i }));

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the error once the field is edited again", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /review funding/i }));
    expect(screen.getByText(/amount is required/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/amount/i), "5");

    expect(screen.queryByText(/amount is required/i)).not.toBeInTheDocument();
  });

  it("can be submitted from the keyboard alone", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.tab();
    await user.keyboard("25");
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(BigInt("250000000"));
  });

  it("explains itself when funding is unavailable", () => {
    renderForm({ isDisabled: true, disabledReason: "Only the admin can add funds." });

    expect(screen.getByLabelText(/amount/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /review funding/i })).toBeDisabled();
    expect(screen.getByText(/only the admin can add funds/i)).toBeInTheDocument();
  });
});
