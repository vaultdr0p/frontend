import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Vault } from "@/pages/Vault";

import { useVaultAllocations } from "@/apiQueries/useVaultAllocations";
import { useVaultOverview } from "@/apiQueries/useVaultOverview";
import { useVaultStatus } from "@/apiQueries/useVaultStatus";
import { useVaultTransaction } from "@/apiQueries/useVaultTransaction";

import { apiHealth, readyView, unavailableView } from "@/helpers/vaultStatusFixtures";

import { useVaultWallet } from "@/hooks/useVaultWallet";

vi.mock("@/apiQueries/useVaultOverview", () => ({ useVaultOverview: vi.fn() }));
vi.mock("@/apiQueries/useVaultAllocations", () => ({ useVaultAllocations: vi.fn() }));
vi.mock("@/apiQueries/useVaultTransaction", () => ({ useVaultTransaction: vi.fn() }));
vi.mock("@/apiQueries/useVaultStatus", () => ({ useVaultStatus: vi.fn() }));
vi.mock("@/hooks/useVaultWallet", () => ({ useVaultWallet: vi.fn() }));

type OverviewResult = ReturnType<typeof useVaultOverview>;

const setOverview = (result: Partial<OverviewResult>) =>
  vi.mocked(useVaultOverview).mockReturnValue(result as OverviewResult);

describe("Vault page", () => {
  beforeEach(() => {
    vi.mocked(useVaultAllocations).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useVaultAllocations>);
    vi.mocked(useVaultTransaction).mockReturnValue({
      phase: "idle",
      prepared: null,
      error: null,
      wasRejected: false,
      txHash: null,
      prepare: vi.fn(),
      confirm: vi.fn(),
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useVaultTransaction>);
    vi.mocked(useVaultWallet).mockReturnValue({
      isConnected: false,
      address: null,
      networkMismatch: null,
      connect: vi.fn(),
      isConnecting: false,
      connectError: null,
    } as unknown as ReturnType<typeof useVaultWallet>);
  });

  // Found in the live check: the overview 404'd ("Vault has not been indexed
  // yet") and the page returned early, so the indexer status was not shown at
  // all — exactly when it mattered most.
  it("still shows the indexer status when the overview cannot be loaded", () => {
    setOverview({
      isLoading: false,
      data: undefined,
      error: { message: "Vault has not been indexed yet." } as OverviewResult["error"],
    });
    vi.mocked(useVaultStatus).mockReturnValue(
      readyView(apiHealth({ status: "lagging", reason: "lag_over_threshold" })),
    );

    render(<Vault />);

    expect(screen.getByText(/could not load this vault/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Indexer: Lagging");
    // ...and the banner's per-reason message, which needs no overview data.
    expect(screen.getByText(/this data is catching up/i)).toBeInTheDocument();
  });

  it("shows the indexer status while the overview is loading", () => {
    setOverview({ isLoading: true, data: undefined, error: null });
    vi.mocked(useVaultStatus).mockReturnValue(unavailableView);

    render(<Vault />);

    expect(screen.getByText(/loading vault/i)).toBeInTheDocument();
    expect(screen.getByText("Indexer: Status unavailable")).toBeInTheDocument();
  });
});
