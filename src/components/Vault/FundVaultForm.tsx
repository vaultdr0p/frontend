import { useId, useState } from "react";

import { Button, Card, Input } from "@stellar/design-system";

import { stroopsToUnits, unitsToStroops, validateAmount } from "@/helpers/vault";

/**
 * Moves tokens from the admin's account into the vault.
 *
 * The amount is handled as a decimal **string** all the way to the signing
 * step, where it becomes stroops as a `bigint`. It is never parsed into a
 * JavaScript number: `parseFloat("0.1234567")` cannot represent a 7-decimal
 * stroop value exactly, and an amount that is wrong in its last digit is still
 * the wrong amount.
 *
 * Validation runs on submit rather than on every keystroke, so the field does
 * not shout at someone who is still typing. The message is rendered through
 * `Input`'s `error` prop, which wires it to the input with `aria-describedby`
 * so a screen reader announces it.
 */
export const FundVaultForm = ({
  onSubmit,
  isBusy,
  isDisabled,
  disabledReason,
}: {
  /** Receives the validated amount in stroops. */
  onSubmit: (amountStroops: bigint) => void;
  isBusy: boolean;
  isDisabled: boolean;
  disabledReason?: string;
}) => {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validateAmount(amount);

    if (!validation.isValid) {
      setError(validation.message);
      return;
    }
    setError(null);
    onSubmit(unitsToStroops(amount));
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-labelledby={`${inputId}-legend`}>
        <h3 id={`${inputId}-legend`}>Add funds</h3>

        <Input
          id={inputId}
          fieldSize="md"
          label="Amount"
          // `inputMode` gives mobile keyboards a decimal pad without making
          // this a number input, which would let the browser reformat the
          // value and lose trailing precision.
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          error={error ?? undefined}
          isError={Boolean(error)}
          note="Up to 7 decimal places."
          disabled={isDisabled || isBusy}
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isBusy}
          disabled={isDisabled || isBusy}
        >
          Review funding
        </Button>

        {isDisabled && disabledReason ? <p role="note">{disabledReason}</p> : null}
      </form>
    </Card>
  );
};

/** Exported for the table's footer total, which formats the same way. */
export const formatUnits = stroopsToUnits;
