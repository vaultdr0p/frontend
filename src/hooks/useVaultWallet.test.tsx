import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaultWalletProvider, useVaultWallet } from "@/hooks/useVaultWallet";

/**
 * Regression tests for the one thing in this module that protects funds:
 * `signTransaction` must re-read the wallet's network immediately before
 * signing, and **refuse** when it does not match or cannot be determined.
 *
 * An earlier version of this hook re-read the network and then signed anyway.
 * It looked correct — the call was there — but it stored the verdict in React
 * state and never consulted it, so the check had no effect. Signing on the
 * wrong network produces a transaction that can never be submitted, and on a
 * vault operation that means an admin believing they had funded or cancelled
 * something when they had not.
 *
 * These tests assert the refusal, not the lookup, precisely because the lookup
 * was already present when the bug existed.
 */

const TESTNET = "Test SDF Network ; September 2015";
const PUBLIC_NETWORK = "Public Global Stellar Network ; September 2015";
const ADDRESS = "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX";

const kit = {
  init: vi.fn(),
  setWallet: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  disconnect: vi.fn(),
};

// vi.mock is hoisted above the constants above, so the factory cannot close
// over them — the passphrases are written out literally here instead.
vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: {
    init: (...args: unknown[]) => kit.init(...args),
    setWallet: (...args: unknown[]) => kit.setWallet(...args),
    getAddress: () => kit.getAddress(),
    getNetwork: () => kit.getNetwork(),
    signTransaction: (...args: unknown[]) => kit.signTransaction(...args),
    disconnect: () => kit.disconnect(),
  },
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/varial", () => ({
  VARIAL_ID: "varial",
  VarialModule: class {},
}));

/** Surfaces the hook's state and exposes signing to the test. */
const Harness = ({ onResult }: { onResult: (value: string) => void }) => {
  const wallet = useVaultWallet();

  return (
    <div>
      <span data-testid="address">{wallet.address ?? "none"}</span>
      <span data-testid="mismatch">
        {wallet.networkMismatch ? wallet.networkMismatch.walletNetwork : "none"}
      </span>
      <button onClick={() => void wallet.connect()}>connect</button>
      <button
        onClick={() => {
          wallet
            .signTransaction("AAAAAgAAAA…")
            .then((signed) => onResult(`signed:${signed}`))
            .catch((error: Error) => onResult(`threw:${error.message}`));
        }}
      >
        sign
      </button>
    </div>
  );
};

const renderWallet = () => {
  const results: string[] = [];

  render(
    <VaultWalletProvider>
      <Harness onResult={(value) => results.push(value)} />
    </VaultWalletProvider>,
  );
  return { results };
};

/** Connects, with the wallet reporting `network` at connect time. */
const connect = async (user: ReturnType<typeof userEvent.setup>, network: string) => {
  kit.getAddress.mockResolvedValue({ address: ADDRESS });
  kit.getNetwork.mockResolvedValue({ networkPassphrase: network });

  await user.click(screen.getByRole("button", { name: "connect" }));
  await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent(ADDRESS));
};

describe("useVaultWallet.signTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "SIGNED" });
  });

  it("signs when the wallet is on the expected network", async () => {
    const user = userEvent.setup();
    const { results } = renderWallet();

    await connect(user, TESTNET);
    await user.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(results).toEqual(["signed:SIGNED"]));
    expect(kit.signTransaction).toHaveBeenCalledWith(
      "AAAAAgAAAA…",
      expect.objectContaining({ address: ADDRESS, networkPassphrase: TESTNET }),
    );
  });

  // The core regression: the wallet was on the right network at connect time
  // and switched afterwards. A verdict cached from connect would sign here.
  it("refuses to sign when the wallet switched networks after connecting", async () => {
    const user = userEvent.setup();
    const { results } = renderWallet();

    await connect(user, TESTNET);

    kit.getNetwork.mockResolvedValue({ networkPassphrase: PUBLIC_NETWORK });

    await user.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toMatch(/^threw:/);
    expect(results[0]).toContain(PUBLIC_NETWORK);
    expect(results[0]).toContain("Nothing was signed");
    // The only assertion that would have caught the original bug.
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it("records the mismatch so the page can warn before signing is attempted", async () => {
    const user = userEvent.setup();
    renderWallet();

    await connect(user, PUBLIC_NETWORK);

    await waitFor(() => expect(screen.getByTestId("mismatch")).toHaveTextContent(PUBLIC_NETWORK));
  });

  it("refuses to sign when the network cannot be confirmed", async () => {
    const user = userEvent.setup();
    const { results } = renderWallet();

    await connect(user, TESTNET);

    // The extension is present but the call fails: the network is unknown,
    // not known-good. Signing on an unverified network is the same risk.
    kit.getNetwork.mockRejectedValue(new Error("extension unavailable"));

    await user.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toContain("Could not confirm which network");
    expect(results[0]).toContain("nothing was signed");
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it("re-reads the network on every signature, not once per connection", async () => {
    const user = userEvent.setup();
    renderWallet();

    await connect(user, TESTNET);
    const afterConnect = kit.getNetwork.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "sign" }));
    await waitFor(() => expect(kit.signTransaction).toHaveBeenCalled());

    expect(kit.getNetwork.mock.calls.length).toBeGreaterThan(afterConnect);
  });

  it("refuses to sign with no wallet connected", async () => {
    const user = userEvent.setup();
    const { results } = renderWallet();

    await user.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toContain("Connect a wallet before signing");
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it("reports a declined signature as a rejection", async () => {
    const user = userEvent.setup();
    const { results } = renderWallet();

    await connect(user, TESTNET);
    kit.signTransaction.mockRejectedValue(new Error("User declined the request"));

    await user.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toMatch(/declined/i);
  });
});

describe("useVaultWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when used outside its provider, rather than silently doing nothing", () => {
    // React logs the error boundary message; the assertion is the throw.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      act(() => {
        render(<Harness onResult={() => undefined} />);
      }),
    ).toThrow(/must be used inside a VaultWalletProvider/);

    consoleError.mockRestore();
  });
});
