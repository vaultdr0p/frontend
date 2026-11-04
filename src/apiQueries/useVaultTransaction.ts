import { useCallback, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { TransactionBuilder, rpc } from "@stellar/stellar-sdk";

import { API_URL } from "@/constants/envVariables";
import { VAULT_QUERY_KEY, vaultNetworkPassphrase } from "@/constants/vault";

import { fetchApi } from "@/helpers/fetchApi";
import { getSdpTenantName } from "@/helpers/getSdpTenantName";
import { localStorageSessionToken } from "@/helpers/localStorageSessionToken";
import { mapBuildTransactionResponse, vaultApiPath } from "@/helpers/vaultApi";

import { useVaultWallet } from "@/hooks/useVaultWallet";

import type {
  ApiBuildTransactionRequest,
  ApiBuildTransactionResponse,
  BuildTransactionResult,
  VaultOperation,
} from "@/types/vault";

import type { AppError } from "@/types";

export type VaultTransactionPhase =
  | "idle"
  | "preparing"
  | "review"
  | "signing"
  | "submitting"
  | "success"
  | "error";

export type PrepareInput = {
  operation: VaultOperation;
  /** Stroops. Required for fund, register and withdraw; unused by cancel. */
  amount?: bigint;
  recipient?: string;
  destination?: string;
};

export type UseVaultTransaction = {
  phase: VaultTransactionPhase;
  prepared: BuildTransactionResult | null;
  error: string | null;
  /** True when the failure was the user declining in the wallet. */
  wasRejected: boolean;
  txHash: string | null;
  prepare: (input: PrepareInput) => Promise<void>;
  confirm: () => Promise<void>;
  reset: () => void;
};

/** Reads an error's message without assuming its type. */
const messageOf = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  // AppError is a plain object with a message, not an Error instance.
  const candidate = error as Partial<AppError> | null;
  return candidate?.message ?? "Something went wrong.";
};

const isRejection = (error: unknown): boolean =>
  /reject|denied|declined|cancell?ed by/i.test(messageOf(error));

/**
 * Builds, signs and submits a vault transaction.
 *
 * The envelope is built by the **backend** (`POST /vault/{id}/transactions`),
 * not in the browser. The backend assembles and simulates the invocation, so
 * the resource fee and auth footprint come from a real simulation, and the
 * summary shown to the signer is derived from the same values that went into
 * the envelope it returns — the description and the bytes cannot disagree.
 *
 * The browser's only jobs are to show that summary, pass the XDR to the wallet
 * extension, and submit what comes back. **No secret key is read, held or
 * logged here**: signing happens inside the wallet, and the only thing this
 * module receives is a signed envelope.
 */
export const useVaultTransaction = (contractId: string): UseVaultTransaction => {
  const [phase, setPhase] = useState<VaultTransactionPhase>("idle");
  const [prepared, setPrepared] = useState<BuildTransactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasRejected, setWasRejected] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { address, signTransaction } = useVaultWallet();

  const reset = useCallback(() => {
    setPhase("idle");
    setPrepared(null);
    setError(null);
    setWasRejected(false);
    setTxHash(null);
  }, []);

  const prepare = useCallback(
    async (input: PrepareInput) => {
      setPhase("preparing");
      setError(null);
      setWasRejected(false);
      setTxHash(null);

      try {
        const body: ApiBuildTransactionRequest = {
          operation: input.operation,
          ...(address ? { source: address } : {}),
          ...(input.recipient ? { recipient: input.recipient } : {}),
          ...(input.destination ? { destination: input.destination } : {}),
          // Amounts go to the wire as decimal strings, never numbers.
          ...(input.amount !== undefined ? { amount: input.amount.toString() } : {}),
        };

        const response: ApiBuildTransactionResponse = await fetchApi(
          `${vaultApiPath(contractId)}/transactions`,
          { method: "POST", body: JSON.stringify(body) },
        );

        const result = mapBuildTransactionResponse(response);

        // The backend states which network it built for. If that is not the
        // network this UI is configured against, something is misconfigured
        // and signing could produce a transaction for the wrong chain.
        if (result.networkPassphrase !== vaultNetworkPassphrase) {
          throw new Error(
            "The server built this transaction for a different network than this dashboard is configured for. Nothing was signed.",
          );
        }

        setPrepared(result);
        setPhase("review");
      } catch (caught) {
        setError(messageOf(caught));
        setPhase("error");
      }
    },
    [address, contractId],
  );

  const confirm = useCallback(async () => {
    if (!prepared) {
      return;
    }

    setError(null);
    setWasRejected(false);
    setPhase("signing");

    let signedXdr: string;
    try {
      // signTransaction re-reads the wallet's network immediately before
      // signing and refuses on a mismatch.
      signedXdr = await signTransaction(prepared.xdr);
    } catch (caught) {
      setWasRejected(isRejection(caught));
      setError(messageOf(caught));
      setPhase("error");
      return;
    }

    setPhase("submitting");
    try {
      const token = localStorageSessionToken.get();

      if (!token) {
        throw new Error("Your session has expired. Sign in again before submitting.");
      }

      // Submit through the backend's authenticated RPC proxy, the same path
      // vault reads use, so no RPC credentials or endpoints live in the browser.
      const rpcUrl = `${API_URL}/rpc/user`;
      const server = new rpc.Server(rpcUrl, {
        allowHttp: new URL(rpcUrl).protocol === "http:",
        headers: {
          Authorization: `Bearer ${token}`,
          "SDP-Tenant-Name": getSdpTenantName(),
        },
      });

      // Parsing with the expected passphrase is also a last check that the
      // wallet signed for the network this vault is on.
      const signedTx = TransactionBuilder.fromXDR(signedXdr, vaultNetworkPassphrase);
      const sent = await server.sendTransaction(signedTx);

      if (sent.status === "ERROR") {
        throw new Error("The network rejected this transaction.");
      }

      const settled = await server.pollTransaction(sent.hash);

      if (settled.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`The transaction did not succeed (${settled.status}).`);
      }

      setTxHash(sent.hash);
      setPhase("success");

      // The indexer needs a moment to catch up, but refreshing now means the
      // table reflects the new state as soon as it does.
      await queryClient.invalidateQueries({ queryKey: [VAULT_QUERY_KEY] });
    } catch (caught) {
      setError(messageOf(caught));
      setPhase("error");
    }
  }, [prepared, queryClient, signTransaction]);

  return { phase, prepared, error, wasRejected, txHash, prepare, confirm, reset };
};
