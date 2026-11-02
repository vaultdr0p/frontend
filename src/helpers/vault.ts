import { StrKey } from "@stellar/stellar-sdk";

import { ASSET_DECIMALS, STROOPS_PER_UNIT, ZERO_STROOPS } from "@/constants/vault";

import { Errors, type Allocation, type AllocationStatus } from "@/contracts/disbursementVault";

/** Discriminated result of validating a single form field. */
export type FieldValidation = { isValid: true } | { isValid: false; message: string };

const valid: FieldValidation = { isValid: true };
const invalid = (message: string): FieldValidation => ({ isValid: false, message });

/**
 * Validates a recipient address.
 *
 * Accepts both classic account ids (`G...`) and contract addresses (`C...`),
 * since the vault's `register` takes a Soroban `Address` and either is a legal
 * recipient. `StrKey` does the checksum validation, so a transposed character
 * is rejected rather than silently registering the wrong recipient.
 */
export const validateRecipientAddress = (value: string): FieldValidation => {
  const address = value.trim();

  if (!address) {
    return invalid("Recipient address is required.");
  }
  if (StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address)) {
    return valid;
  }
  if (address.startsWith("S")) {
    // Catch this explicitly: pasting a secret key into a public address field
    // is a credential leak, not a typo, and deserves a pointed message.
    return invalid("That looks like a secret key. Enter a public address starting with G or C.");
  }
  return invalid("Enter a valid Stellar address starting with G or C.");
};

/**
 * Validates a decimal amount string.
 *
 * Rejects more than 7 decimal places rather than rounding, because rounding a
 * disbursement amount silently changes what a recipient is owed.
 */
export const validateAmount = (value: string, available?: bigint): FieldValidation => {
  const amount = value.trim();

  if (!amount) {
    return invalid("Amount is required.");
  }
  if (!/^\d*\.?\d*$/.test(amount) || amount === ".") {
    return invalid("Enter a number, for example 100.50.");
  }

  const [, fraction = ""] = amount.split(".");
  if (fraction.length > ASSET_DECIMALS) {
    return invalid(`At most ${ASSET_DECIMALS} decimal places are supported.`);
  }

  let stroops: bigint;
  try {
    stroops = unitsToStroops(amount);
  } catch {
    return invalid("Enter a valid amount.");
  }

  if (stroops <= ZERO_STROOPS) {
    return invalid("Amount must be greater than zero.");
  }
  if (available !== undefined && stroops > available) {
    return invalid(`Amount exceeds the ${stroopsToUnits(available)} available.`);
  }
  return valid;
};

/**
 * Converts a decimal unit string to `i128` stroops.
 *
 * Done with BigInt string manipulation rather than floating point: `0.1 * 1e7`
 * is not exactly 1000000 in IEEE-754, and an off-by-one stroop on a
 * disbursement is a real accounting error.
 */
export const unitsToStroops = (value: string): bigint => {
  const [whole, fraction = ""] = value.trim().split(".");
  const padded = fraction.padEnd(ASSET_DECIMALS, "0").slice(0, ASSET_DECIMALS);
  return BigInt(whole || "0") * STROOPS_PER_UNIT + BigInt(padded || "0");
};

/** Converts `i128` stroops to a trimmed decimal unit string. */
export const stroopsToUnits = (stroops: bigint): string => {
  const isNegative = stroops < ZERO_STROOPS;
  const absolute = isNegative ? -stroops : stroops;

  const whole = absolute / STROOPS_PER_UNIT;
  const fraction = (absolute % STROOPS_PER_UNIT).toString().padStart(ASSET_DECIMALS, "0");
  const trimmed = fraction.replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
};

/** Shortens an address for display, keeping enough to be recognisable. */
export const truncateAddress = (address: string, visible = 4): string =>
  address.length <= visible * 2
    ? address
    : `${address.slice(0, visible)}…${address.slice(-visible)}`;

/** The `AllocationStatus` tag as a plain string, for display and filtering. */
export const allocationStatusTag = (allocation: Allocation): AllocationStatus["tag"] =>
  allocation.status.tag;

/**
 * Maps a thrown contract error onto its declared message.
 *
 * The bindings surface failures as `Error(Contract, #N)`; `Errors` is the
 * generated code -> message map, so this stays in sync with the contract's
 * error enum automatically when the bindings are regenerated.
 */
export const vaultErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];

  if (code) {
    const known = (Errors as Record<string, { message: string }>)[code];
    if (known) {
      return vaultErrorExplanation(known.message);
    }
  }
  return raw;
};

/** Turns a contract error name into something an operator can act on. */
const vaultErrorExplanation = (name: string): string => {
  switch (name) {
    case "AlreadyInitialized":
      return "This vault has already been initialized.";
    case "NotInitialized":
      return "This vault has not been initialized yet.";
    case "InvalidAmount":
      return "The amount must be greater than zero.";
    case "InvalidDeadline":
      return "The deadline must be in the future.";
    case "AllocationExists":
      return "That recipient already has an allocation. Cancel it before registering a new one.";
    case "AllocationNotFound":
      return "That recipient has no allocation in this vault.";
    case "AlreadyClaimed":
      return "That allocation has already been claimed.";
    case "AllocationCancelled":
      return "That allocation was cancelled.";
    case "InsufficientFunds":
      return "The vault does not have enough unallocated funds for this operation.";
    case "DeadlineNotReached":
      return "Allocations can only be cancelled after the deadline has passed.";
    case "DeadlinePassed":
      return "The deadline has passed, so this is no longer allowed.";
    case "MathOverflow":
      return "The amount is too large.";
    default:
      return name;
  }
};
