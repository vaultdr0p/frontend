import { useCallback, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import type { AssembledTransaction, SignTransaction } from "@stellar/stellar-sdk/contract";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { vaultErrorMessage } from "@/helpers/vault";

import { useVaultWallet } from "@/hooks/useVaultWallet";

/** A human-readable line in the pre-signing summary. */
export type SummaryRow = { label: string; value: string };

/** What the user is about to sign. */
export type TransactionSummary = {
  /** Short description of the operation, e.g. "Fund vault". */
  operation: string;
  rows: SummaryRow[];
  /** Network fee in stroops, from simulation, when the SDK exposes it. */
  feeStroops?: string;
};

export type VaultTransactionPhase =
  | "idle"
  | "preparing"
  | "review"
  | "signing"
  | "submitting"
  | "success"
  | "error";

/** A prepared-but-unsigned vault transaction awaiting confirmation. */
type Prepared = {
  tx: AssembledTransaction<unknown>;
  summary: TransactionSummary;
};

export type UseVaultTransaction = {
  phase: VaultTransactionPhase;
  summary: TransactionSummary | null;
  error: string | null;
  /** Simulates the operation and moves to the review phase. */
  prepare: (input: {
    operation: string;
    rows: SummaryRow[];
    build: () => Promise<AssembledTransaction<unknown>>;
  }) => Promise<void>;
  /** Signs the reviewed transaction with the wallet and submits it. */
  confirm: () => Promise<void>;
  /** Abandons a prepared transaction without signing. */
  cancel: () => void;
  /** Clears a terminal phase so the form can be used again. */
  reset: () => void;
};

/**
 * Drives a single vault write through simulate -> review -> sign -> submit.
 *
 * Simulation happens before the user is asked for a signature, so a call that
 * the contract would reject (`InsufficientFunds`, `DeadlinePassed`, ...)
 * surfaces as a readable error without ever opening the wallet. Only after the
 * user confirms the summary is the envelope handed to Freighter.
 */
export const useVaultTransaction = (): UseVaultTransaction => {
  const queryClient = useQueryClient();
  const { signTransaction, networkMismatch, isConnected } = useVaultWallet();

  const [phase, setPhase] = useState<VaultTransactionPhase>("idle");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback<UseVaultTransaction["prepare"]>(
    async ({ operation, rows, build }) => {
      setError(null);

      if (!isConnected) {
        setPhase("error");
        setError("Connect a wallet before submitting a transaction.");
        return;
      }
      // Checked before simulating as well as before signing: there is no point
      // simulating against a network the wallet cannot sign for.
      if (networkMismatch) {
        setPhase("error");
        setError(
          `Your wallet is on "${networkMismatch.walletNetwork}" but this vault is on ` +
            `"${networkMismatch.expected}". Switch networks in Freighter and reconnect.`,
        );
        return;
      }

      setPhase("preparing");
      try {
        const tx = await build();
        setPrepared({
          tx,
          summary: { operation, rows, feeStroops: tx.built?.fee },
        });
        setPhase("review");
      } catch (caught) {
        setError(vaultErrorMessage(caught));
        setPhase("error");
      }
    },
    [isConnected, networkMismatch],
  );

  const confirm = useCallback(async () => {
    if (!prepared) {
      return;
    }
    setError(null);
    setPhase("signing");

    // Adapt the wallet hook to the SDK's Freighter-shaped signer. Only an XDR
    // envelope crosses this boundary; no key material is involved.
    const signer: SignTransaction = async (xdr) => ({
      signedTxXdr: await signTransaction(xdr),
    });

    try {
      setPhase("submitting");
      // signAndSend submits and then polls getTransaction until the ledger
      // closes, so a resolved promise means the ledger accepted it.
      await prepared.tx.signAndSend({ signTransaction: signer });

      await queryClient.invalidateQueries({ queryKey: [VAULT_QUERY_KEY] });
      setPrepared(null);
      setPhase("success");
    } catch (caught) {
      setError(vaultErrorMessage(caught));
      setPhase("error");
    }
  }, [prepared, signTransaction, queryClient]);

  const cancel = useCallback(() => {
    setPrepared(null);
    setError(null);
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setPhase(prepared ? "review" : "idle");
  }, [prepared]);

  return {
    phase,
    summary: prepared?.summary ?? null,
    error,
    prepare,
    confirm,
    cancel,
    reset,
  };
};
