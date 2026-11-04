import { describe, expect, it } from "vitest";

import {
  stroopsToUnits,
  truncateAddress,
  unitsToStroops,
  validateAmount,
  validateRecipientAddress,
  vaultErrorMessage,
} from "@/helpers/vault";

// Real testnet addresses, so StrKey's checksum validation is exercised against
// genuine values rather than hand-made strings that happen to be 56 chars.
const VALID_G = "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX";
const VALID_C = "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53";

describe("unitsToStroops", () => {
  it.each([
    ["1", "10000000"],
    ["0.0000001", "1"],
    ["100.5", "1005000000"],
    ["0", "0"],
    ["0.1", "1000000"],
    ["1234.1234567", "12341234567"],
    ["", "0"],
  ])("converts %s units to %s stroops", (input, expected) => {
    expect(unitsToStroops(input).toString()).toBe(expected);
  });

  // The reason this helper does string maths instead of multiplying by 1e7:
  // for these inputs the float product is not an integer at all, so a naive
  // `amount * 1e7` would mis-state what a recipient is owed by a stroop.
  it.each([
    ["0.035", "350000"],
    ["0.043", "430000"],
    ["0.07", "700000"],
    ["0.087", "870000"],
  ])("is exact for %s, where floating point is not", (units, expected) => {
    expect(unitsToStroops(units).toString()).toBe(expected);

    // Pin the actual float misbehaviour, so the intent survives refactoring:
    // these products are genuinely not integers.
    expect(Number.isInteger(Number(units) * 1e7)).toBe(false);
    expect(Number(units) * 1e7).not.toBe(Number(expected));
  });

  it("handles amounts far beyond Number.MAX_SAFE_INTEGER", () => {
    // i128::MAX in units. Number cannot represent this; BigInt must.
    const huge = "17014118346046923173168730371588.4105727";
    expect(unitsToStroops(huge).toString()).toBe("170141183460469231731687303715884105727");
  });

  it("truncates beyond 7 decimals rather than rounding up", () => {
    // validateAmount rejects this input; the converter must not silently
    // round a value a caller forced through.
    expect(unitsToStroops("1.99999999").toString()).toBe("19999999");
  });
});

describe("stroopsToUnits", () => {
  it.each([
    ["10000000", "1"],
    ["1", "0.0000001"],
    ["1005000000", "100.5"],
    ["0", "0"],
    ["170141183460469231731687303715884105727", "17014118346046923173168730371588.4105727"],
  ])("converts %s stroops to %s units", (input, expected) => {
    expect(stroopsToUnits(BigInt(input))).toBe(expected);
  });

  it("trims trailing zeros but keeps significant ones", () => {
    expect(stroopsToUnits(BigInt("1200000"))).toBe("0.12");
    expect(stroopsToUnits(BigInt("10000001"))).toBe("1.0000001");
  });

  it("handles negatives, which available() can return if state is inconsistent", () => {
    expect(stroopsToUnits(BigInt("-10000000"))).toBe("-1");
    expect(stroopsToUnits(BigInt("-1"))).toBe("-0.0000001");
  });

  it("round-trips with unitsToStroops", () => {
    for (const units of ["1", "0.0000001", "100.5", "17014118346046923173168730371588.4105727"]) {
      expect(stroopsToUnits(unitsToStroops(units))).toBe(units);
    }
  });
});

describe("validateRecipientAddress", () => {
  it.each([
    ["a classic account id", VALID_G],
    ["a contract address", VALID_C],
  ])("accepts %s", (_label, address) => {
    expect(validateRecipientAddress(address)).toEqual({ isValid: true });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateRecipientAddress(`  ${VALID_G}  `)).toEqual({ isValid: true });
  });

  it("requires a value", () => {
    const result = validateRecipientAddress("   ");
    expect(result.isValid).toBe(false);
    expect(result).toHaveProperty("message", "Recipient address is required.");
  });

  // Pasting a secret key into a public field is a credential leak, not a typo,
  // so it must get its own pointed message.
  //
  // The fixture is synthesised rather than written out: the validator only
  // looks at the "S" prefix, so a real-looking seed would buy nothing and
  // would cost every future reader the effort of proving it is not live.
  it("calls out a pasted secret key specifically", () => {
    const notARealSecretKey = "S".padEnd(56, "A");

    const result = validateRecipientAddress(notARealSecretKey);
    expect(result.isValid).toBe(false);
    expect(result).toHaveProperty("message", expect.stringContaining("secret key"));
  });

  it("rejects an address that fails its checksum", () => {
    // Last two characters transposed: right length and alphabet, wrong checksum.
    const transposed = VALID_G.slice(0, -2) + VALID_G.slice(-1) + VALID_G.slice(-2, -1);
    const result = validateRecipientAddress(transposed);
    expect(result.isValid).toBe(false);
  });

  it.each([
    ["too short", "GAODBHVR"],
    ["wrong prefix", "MAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX"],
    ["not base32", "G!!!BHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX"],
  ])("rejects %s", (_label, address) => {
    expect(validateRecipientAddress(address).isValid).toBe(false);
  });
});

describe("validateAmount", () => {
  it.each(["1", "0.5", "100.5", "0.0000001", "1234567"])("accepts %s", (value) => {
    expect(validateAmount(value)).toEqual({ isValid: true });
  });

  it.each([
    ["empty", "   ", "Amount is required."],
    ["zero", "0", "Amount must be greater than zero."],
    ["a bare dot", ".", "Enter a number, for example 100.50."],
    ["letters", "abc", "Enter a number, for example 100.50."],
    ["a negative sign", "-1", "Enter a number, for example 100.50."],
    ["scientific notation", "1e7", "Enter a number, for example 100.50."],
  ])("rejects %s", (_label, value, message) => {
    const result = validateAmount(value);
    expect(result.isValid).toBe(false);
    expect(result).toHaveProperty("message", message);
  });

  // Rounding a disbursement silently changes what someone is owed, so an
  // over-precise amount is rejected rather than quietly truncated.
  it("rejects more than 7 decimal places instead of rounding", () => {
    const result = validateAmount("1.12345678");
    expect(result.isValid).toBe(false);
    expect(result).toHaveProperty("message", "At most 7 decimal places are supported.");
  });

  it("accepts exactly 7 decimal places", () => {
    expect(validateAmount("1.1234567")).toEqual({ isValid: true });
  });

  describe("against an available balance", () => {
    const available = BigInt("1000000000"); // 100 units

    it("accepts an amount at the limit", () => {
      expect(validateAmount("100", available)).toEqual({ isValid: true });
    });

    it("rejects one stroop over the limit", () => {
      const result = validateAmount("100.0000001", available);
      expect(result.isValid).toBe(false);
      expect(result).toHaveProperty("message", expect.stringContaining("exceeds"));
    });

    it("reports the available amount in units, not stroops", () => {
      const result = validateAmount("500", available);
      expect(result).toHaveProperty("message", expect.stringContaining("100"));
    });

    it("rejects everything when nothing is available", () => {
      expect(validateAmount("0.0000001", BigInt(0)).isValid).toBe(false);
    });
  });
});

describe("vaultErrorMessage", () => {
  // Codes come from the contract's #[contracterror] enum, via the generated
  // Errors map, so these assertions also guard the bindings staying in sync.
  it.each([
    [7, "already been claimed"],
    [8, "was cancelled"],
    [9, "unallocated funds"],
    [10, "after the deadline has passed"],
    [11, "deadline has passed"],
    [5, "already has an allocation"],
    [6, "no allocation"],
    [3, "greater than zero"],
    [12, "too large"],
  ])("maps contract error #%i onto operator-facing prose", (code, fragment) => {
    const message = vaultErrorMessage(new Error(`Error(Contract, #${code})`));
    expect(message).toContain(fragment);
    // The raw code form must never reach the user.
    expect(message).not.toContain("Error(Contract");
  });

  it("tolerates whitespace variations in the error string", () => {
    expect(vaultErrorMessage(new Error("Error(Contract,#7)"))).toContain("already been claimed");
  });

  it("passes through an unrecognised error unchanged", () => {
    expect(vaultErrorMessage(new Error("network unreachable"))).toBe("network unreachable");
  });

  it("handles a non-Error throw", () => {
    expect(vaultErrorMessage("plain string failure")).toBe("plain string failure");
  });

  it("does not misread an unknown contract code as a known one", () => {
    expect(vaultErrorMessage(new Error("Error(Contract, #9999)"))).toContain("9999");
  });
});

describe("truncateAddress", () => {
  it("shortens a long address while keeping both ends", () => {
    expect(truncateAddress(VALID_G)).toBe("GAOD…VZRX");
  });

  it("leaves a short value untouched", () => {
    expect(truncateAddress("GAOD")).toBe("GAOD");
  });

  it("honours a custom visible length", () => {
    expect(truncateAddress(VALID_G, 6)).toBe("GAODBH…OKVZRX");
  });
});
