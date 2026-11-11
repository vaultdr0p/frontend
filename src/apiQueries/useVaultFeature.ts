import { useQuery } from "@tanstack/react-query";

import { VAULT_QUERY_KEY } from "@/constants/vault";

import { fetchApi } from "@/helpers/fetchApi";
import { vaultApiPath } from "@/helpers/vaultApi";

/** How long to wait before probing again after an inconclusive answer. */
export const VAULT_FEATURE_RETRY_MS = 30_000;

export type VaultFeatureProbeResult = "enabled" | "disabled" | "inconclusive";

/**
 * Reads one response from `GET /vault/{contract_id}/status` as a feature flag.
 *
 * The backend has no "vault enabled" setting the frontend can read. Instead,
 * when `ENABLE_VAULT` is off the vault routes are simply not registered, so
 * the router answers its own plain-text `404 page not found`; when it is on,
 * every vault route answers JSON, including its own 404s ("Vault not found.",
 * "Vault has not been indexed yet."). The backend's design doc documents this
 * as the way for the dashboard to feature-detect.
 *
 * Anything else (403, 5xx, a proxy page) says nothing about the flag, so it is
 * "inconclusive" rather than a guess either way.
 */
export const classifyVaultFeatureResponse = (
  status: number,
  contentType: string | null,
): VaultFeatureProbeResult => {
  if (status >= 200 && status < 300) {
    return "enabled";
  }
  if (status === 404) {
    const type = (contentType ?? "").toLowerCase();
    if (type.startsWith("application/json")) {
      return "enabled";
    }
    if (type.startsWith("text/plain")) {
      return "disabled";
    }
  }
  return "inconclusive";
};

/**
 * Whether the backend has the vault feature enabled, for showing the "Vault"
 * nav item. `false` until a definitive answer says otherwise.
 *
 * Caching follows how much each answer is worth:
 * - A definitive answer (2xx, JSON 404, plain-text 404) depends only on the
 *   backend's configuration, so it is kept for the rest of the session and
 *   never refetched.
 * - An inconclusive one (403, 5xx, network error) is never cached as a result:
 *   the query fn throws, so the query stays in an error state with no data.
 *   React-query then probes again on the next mount (every navigation mounts a
 *   new InnerPage) and on a `VAULT_FEATURE_RETRY_MS` timer, and the item stays
 *   hidden meanwhile.
 */
export const useVaultFeature = (contractId: string, isEnabled = true): boolean => {
  const query = useQuery<Exclude<VaultFeatureProbeResult, "inconclusive">, Error>({
    queryKey: [VAULT_QUERY_KEY, "feature", contractId],
    queryFn: async () => {
      // customCallback hands back the raw Response: the status and content
      // type are the signal here, and fetchApi's normal handling would turn
      // both 404 shapes into the same thrown error.
      const response: Response = await fetchApi(`${vaultApiPath(contractId)}/status`, undefined, {
        customCallback: (r) => r,
      });
      const result = classifyVaultFeatureResponse(
        response.status,
        response.headers.get("content-type"),
      );
      if (result === "inconclusive") {
        throw new Error(`Vault feature probe was inconclusive (HTTP ${response.status}).`);
      }
      return result;
    },
    enabled: isEnabled && Boolean(contractId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    retryOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.status === "error" ? VAULT_FEATURE_RETRY_MS : false),
    refetchIntervalInBackground: false,
  });

  return query.data === "enabled";
};
