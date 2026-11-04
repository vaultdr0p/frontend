import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { VARIAL_ID, VarialModule } from "@creit.tech/stellar-wallets-kit/modules/varial";

import { vaultNetworkPassphrase } from "@/constants/vault";

/**
 * Freighter signing for vault transactions, via Stellar Wallets Kit.
 *
 * Secret keys never reach this application: we hand an unsigned transaction
 * envelope (XDR) to the wallet extension and receive a signed envelope back.
 * Nothing in this module reads, stores or logs key material.
 *
 * Freighter was rebranded to Varial, and the kit's `FreighterModule` /
 * `FREIGHTER_ID` are deprecated aliases of `VarialModule` / `VARIAL_ID`. The
 * non-deprecated names are used here; the wallet is still Freighter to users.
 */

/** The kit is a module-level singleton, so initialise it exactly once. */
let isKitInitialised = false;

const initialiseKit = () => {
  if (isKitInitialised) {
    return;
  }
  StellarWalletsKit.init({
    modules: [new VarialModule()],
    selectedWalletId: VARIAL_ID,
    network: networkFromPassphrase(vaultNetworkPassphrase),
  });
  isKitInitialised = true;
};

/** Maps a passphrase to the kit's network enum, defaulting to testnet. */
const networkFromPassphrase = (passphrase: string): Networks =>
  passphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;

export type VaultWalletState = {
  /** Connected account, or null when no wallet is connected. */
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  /** Set when connecting failed, including an explicit user rejection. */
  connectError: string | null;
  /**
   * The passphrase the wallet is currently on, when it differs from the one
   * the vault expects. Non-null means signing would produce a transaction for
   * the wrong network, so writes must be blocked.
   */
  networkMismatch: { walletNetwork: string; expected: string } | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signs an XDR envelope with the connected wallet. */
  signTransaction: (xdr: string) => Promise<string>;
};

const VaultWalletContext = createContext<VaultWalletState | null>(null);

/**
 * Normalises wallet errors into something displayable.
 *
 * A user declining in the extension is a normal outcome, not a fault, so it
 * gets its own plain message rather than a raw error string.
 */
const walletErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);

  if (/reject|denied|declined|cancel/i.test(raw)) {
    return "Request was rejected in the wallet.";
  }
  if (/not available|not installed|no wallet/i.test(raw)) {
    return "Freighter was not detected. Install the extension and reload this page.";
  }
  return raw;
};

export const VaultWalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState<VaultWalletState["networkMismatch"]>(null);

  /**
   * Re-reads the wallet's network, records any mismatch, and returns the
   * verdict.
   *
   * The verdict is returned as well as stored because `signTransaction` has to
   * act on it immediately: reading the state variable it just set would see
   * the previous render's value and sign anyway.
   */
  const refreshNetwork = useCallback(async (): Promise<{
    mismatch: VaultWalletState["networkMismatch"];
    isConfirmed: boolean;
  }> => {
    try {
      const { networkPassphrase } = await StellarWalletsKit.getNetwork();
      const mismatch =
        networkPassphrase === vaultNetworkPassphrase
          ? null
          : { walletNetwork: networkPassphrase, expected: vaultNetworkPassphrase };

      setNetworkMismatch(mismatch);
      return { mismatch, isConfirmed: true };
    } catch {
      // A failure here only means we cannot confirm the network; leave any
      // previous verdict alone rather than claiming a mismatch we did not see.
      return { mismatch: null, isConfirmed: false };
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setConnectError(null);
    try {
      initialiseKit();
      StellarWalletsKit.setWallet(VARIAL_ID);
      const { address: connected } = await StellarWalletsKit.getAddress();
      setAddress(connected);
      await refreshNetwork();
    } catch (error) {
      setConnectError(walletErrorMessage(error));
      setAddress(null);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshNetwork]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // Disconnect is best-effort: clearing local state below is what the user
      // asked for, so a failing extension call must not block it.
    }
    setAddress(null);
    setNetworkMismatch(null);
    setConnectError(null);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!address) {
        throw new Error("Connect a wallet before signing.");
      }

      // Re-check immediately before signing: the user can switch networks in
      // the extension at any time after connecting, including while the
      // confirmation dialog is open. A stale verdict from connect time is not
      // good enough, so this reads the wallet again and refuses on a mismatch
      // rather than merely noting it.
      const { mismatch, isConfirmed } = await refreshNetwork();

      if (mismatch) {
        throw new Error(
          `Your wallet is on ${mismatch.walletNetwork}, but this vault is on ${mismatch.expected}. Switch networks in Freighter and try again. Nothing was signed.`,
        );
      }
      if (!isConfirmed) {
        throw new Error(
          "Could not confirm which network your wallet is on, so nothing was signed. Check Freighter and try again.",
        );
      }

      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: vaultNetworkPassphrase,
      });
      return signedTxXdr;
    },
    [address, refreshNetwork],
  );

  // Keep the mismatch verdict current while a wallet is connected.
  useEffect(() => {
    if (!address) {
      return;
    }
    void refreshNetwork();
  }, [address, refreshNetwork]);

  const value = useMemo<VaultWalletState>(
    () => ({
      address,
      isConnected: Boolean(address),
      isConnecting,
      connectError,
      networkMismatch,
      connect,
      disconnect,
      signTransaction,
    }),
    [address, isConnecting, connectError, networkMismatch, connect, disconnect, signTransaction],
  );

  return <VaultWalletContext.Provider value={value}>{children}</VaultWalletContext.Provider>;
};

export const useVaultWallet = (): VaultWalletState => {
  const context = useContext(VaultWalletContext);

  if (!context) {
    throw new Error("useVaultWallet must be used inside a VaultWalletProvider");
  }
  return context;
};
