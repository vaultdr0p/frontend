import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IndexerStatusBanner } from "@/components/Vault/IndexerStatusBanner";
import { VaultStatusIndicator } from "@/components/Vault/VaultStatusIndicator";

import {
  VAULT_STATUS_MAX_BACKOFF_MS,
  VAULT_STATUS_POLL_MS,
  useVaultStatus,
  vaultStatusPollDelay,
} from "@/apiQueries/useVaultStatus";

import { fetchApi } from "@/helpers/fetchApi";
import { STATUS_CONTRACT_ID, apiHealth } from "@/helpers/vaultStatusFixtures";

import type { IndexerStatus } from "@/types/vault";

vi.mock("@/helpers/fetchApi", () => ({ fetchApi: vi.fn() }));
const mockFetchApi = vi.mocked(fetchApi);

const STATUS_URL = `http://localhost:8000/vault/${STATUS_CONTRACT_ID}/status`;

const healthyIndexer: IndexerStatus = {
  status: "healthy",
  isDegraded: false,
  lastLedger: 1,
  latestLedger: 1,
  lagLedgers: 0,
  lastIndexedAt: null,
  gapFromLedger: null,
  gapToLedger: null,
  degradedReason: null,
};

/** The page's wiring in miniature: one hook feeding the indicator and the banner. */
const Harness = () => {
  const view = useVaultStatus(STATUS_CONTRACT_ID);
  return (
    <>
      <VaultStatusIndicator view={view} />
      <IndexerStatusBanner indexer={healthyIndexer} health={view} />
    </>
  );
};

const renderWithClient = (ui: ReactNode) => {
  const client = new QueryClient();
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...utils, client };
};

/**
 * Advances fake time by `ms` and lets everything that follows settle.
 *
 * The order matters, and was found empirically: a synchronous `act` fires
 * the poll timer (starting a fetch); an async `act` lets the fetch promise
 * settle; another synchronous `act` runs react-query's `setTimeout(0)`
 * notification batch; a final async `act` lets React commit. Doing it all
 * inside one async `act` with `advanceTimersByTimeAsync` leaves the
 * component un-rendered after interval-driven fetches.
 */
const flush = async (ms = 0) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    // Browsers fire this on document with bubbles: true, so it reaches window,
    // which is where react-query's focusManager listens.
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
};

const statusCalls = () => mockFetchApi.mock.calls.filter(([url]) => url === STATUS_URL).length;

describe("vaultStatusPollDelay", () => {
  it.each([
    [0, 30_000],
    [1, 60_000],
    [2, 120_000],
    [3, 240_000],
    [4, VAULT_STATUS_MAX_BACKOFF_MS],
    [10, VAULT_STATUS_MAX_BACKOFF_MS],
  ])("after %i consecutive failures waits %i ms", (failures, delay) => {
    expect(vaultStatusPollDelay(failures)).toBe(delay);
  });
});

describe("useVaultStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T09:20:30Z"));
    mockFetchApi.mockReset();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    // focusManager caches focus state across tests; reset it to "follow the document".
    focusManager.setFocused(undefined);
  });

  it("calls the status endpoint and shows the result", async () => {
    mockFetchApi.mockResolvedValue(apiHealth());
    renderWithClient(<Harness />);
    await flush();

    expect(mockFetchApi).toHaveBeenCalledWith(STATUS_URL);
    expect(screen.getByRole("status")).toHaveTextContent("Indexer: Healthy");
  });

  it("polls every 30 s", async () => {
    mockFetchApi.mockResolvedValue(apiHealth());
    renderWithClient(<Harness />);
    await flush();
    expect(statusCalls()).toBe(1);

    await flush(VAULT_STATUS_POLL_MS - 1);
    expect(statusCalls()).toBe(1);
    await flush(1);
    expect(statusCalls()).toBe(2);
    await flush(VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(3);
  });

  it("stops polling on unmount", async () => {
    mockFetchApi.mockResolvedValue(apiHealth());
    const { unmount } = renderWithClient(<Harness />);
    await flush();
    expect(statusCalls()).toBe(1);

    unmount();
    await flush(VAULT_STATUS_POLL_MS * 10);
    expect(statusCalls()).toBe(1);
  });

  it("pauses while the tab is hidden and refreshes when it is visible again", async () => {
    mockFetchApi.mockResolvedValue(apiHealth());
    renderWithClient(<Harness />);
    await flush();
    expect(statusCalls()).toBe(1);

    setVisibility("hidden");
    await flush(VAULT_STATUS_POLL_MS * 5);
    expect(statusCalls()).toBe(1);

    setVisibility("visible");
    await flush();
    expect(statusCalls()).toBe(2);
  });

  it("starts the backoff from scratch for a failure after a recovery", async () => {
    mockFetchApi
      .mockRejectedValueOnce(new Error("Failed to fetch")) // t=0     fail #1
      .mockRejectedValueOnce(new Error("Failed to fetch")) // t=60s   fail #2
      .mockResolvedValueOnce(apiHealth()) //                  t=180s  success
      .mockRejectedValue(new Error("Failed to fetch")); //   t=210s  fail #1 again
    renderWithClient(<Harness />);
    await flush();
    await flush(2 * VAULT_STATUS_POLL_MS);
    await flush(4 * VAULT_STATUS_POLL_MS);
    await flush(VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(4);

    // The streak was reset by the success, so this is failure #1 again: the
    // next attempt comes after 60 s, not the 240 s a stale count would give.
    await flush(2 * VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(5);
  });

  it("backs off on consecutive errors and returns to 30 s after a success", async () => {
    mockFetchApi.mockRejectedValue(new Error("Failed to fetch"));
    renderWithClient(<Harness />);
    await flush();
    expect(statusCalls()).toBe(1); // first failure; retry is off, so no burst

    await flush(VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(1); // backed off to 60 s, not 30 s
    await flush(VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(2); // 60 s after the first failure

    await flush(2 * VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(2); // now 120 s
    mockFetchApi.mockResolvedValue(apiHealth());
    await flush(2 * VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(3); // the recovery fetch succeeds

    await flush(VAULT_STATUS_POLL_MS);
    expect(statusCalls()).toBe(4); // back to 30 s
  });

  // react-query keeps the last good data after a later fetch fails. The UI
  // must not keep showing it.
  it("shows Status unavailable, not the previous Healthy, after a refetch fails", async () => {
    mockFetchApi.mockResolvedValueOnce(apiHealth());
    renderWithClient(<Harness />);
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Indexer: Healthy");

    mockFetchApi.mockRejectedValue(new Error("Failed to fetch"));
    await flush(VAULT_STATUS_POLL_MS);

    expect(screen.getByRole("status")).toHaveTextContent("Indexer: Status unavailable");
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("vault-status-lag")).not.toBeInTheDocument();
  });

  it("drops a stale warning banner after a refetch fails", async () => {
    mockFetchApi.mockResolvedValueOnce(
      apiHealth({ status: "stalled", reason: "no_recent_commit" }),
    );
    renderWithClient(<Harness />);
    await flush();
    const bannerTitle = /the indexer has stopped updating$/i;
    expect(screen.getByText(bannerTitle)).toBeInTheDocument();

    mockFetchApi.mockRejectedValue(new Error("Failed to fetch"));
    await flush(VAULT_STATUS_POLL_MS);

    expect(screen.queryByText(bannerTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(/as of the last successful update/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Status unavailable");
  });

  it("treats a response it cannot understand as unavailable, never healthy", async () => {
    mockFetchApi.mockResolvedValue(apiHealth({ status: "ok", reason: "rpc_unreachable" }));
    renderWithClient(<Harness />);
    await flush();

    expect(screen.getByRole("status")).toHaveTextContent("Status unavailable");
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
  });
});
