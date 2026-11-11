import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Vault } from "@/pages/Vault";

import { useVaultAllocations } from "@/apiQueries/useVaultAllocations";
import { useVaultOverview } from "@/apiQueries/useVaultOverview";
import { useVaultStatus } from "@/apiQueries/useVaultStatus";
import { useVaultTransaction } from "@/apiQueries/useVaultTransaction";

import { VAULT_NOT_INDEXED_MESSAGE, mapAllocation, mapVaultOverview } from "@/helpers/vaultApi";
import { apiHealth, readyView, unavailableView } from "@/helpers/vaultStatusFixtures";

import { useVaultWallet } from "@/hooks/useVaultWallet";

vi.mock("@/apiQueries/useVaultOverview", () => ({ useVaultOverview: vi.fn() }));
vi.mock("@/apiQueries/useVaultAllocations", () => ({ useVaultAllocations: vi.fn() }));
vi.mock("@/apiQueries/useVaultTransaction", () => ({ useVaultTransaction: vi.fn() }));
vi.mock("@/apiQueries/useVaultStatus", () => ({ useVaultStatus: vi.fn() }));
vi.mock("@/hooks/useVaultWallet", () => ({ useVaultWallet: vi.fn() }));

type OverviewResult = ReturnType<typeof useVaultOverview>;
type AllocationsResult = ReturnType<typeof useVaultAllocations>;

const setOverview = (result: Partial<OverviewResult>) =>
  vi.mocked(useVaultOverview).mockReturnValue(result as OverviewResult);

const setOverviewError = (error: { message: string; status?: number }) =>
  setOverview({ isLoading: false, data: undefined, error: error as OverviewResult["error"] });

const RECIPIENT = "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX";

const setAllocations = () =>
  vi.mocked(useVaultAllocations).mockReturnValue({
    data: {
      allocations: [
        mapAllocation({
          recipient: RECIPIENT,
          amount: "25000000",
          status: "PENDING",
          registered_at: "2026-11-10T12:00:00Z",
          registered_ledger: 100,
          settled_at: null,
          settled_ledger: null,
        }),
      ],
    },
    isLoading: false,
    error: null,
  } as unknown as AllocationsResult);

const NOT_INDEXED_TEXT =
  "This vault hasn't been indexed yet, so its balances and details can't be shown. " +
  "Recipient allocations are listed below. If this doesn't change, contact your administrator.";

const loadedOverview = () =>
  mapVaultOverview({
    contract_id: "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53",
    admin: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    deadline: "2026-12-01T00:00:00Z",
    is_expired: false,
    total_allocated: "30000000",
    total_claimed: "10000000",
    balance: "100000000",
    available: "70000000",
    indexer: {
      status: "healthy",
      last_ledger: 1,
      latest_ledger: 1,
      lag_ledgers: 0,
      last_indexed_at: null,
      gap_from_ledger: null,
      gap_to_ledger: null,
      degraded_reason: null,
    },
  });

const notification = (text: RegExp) => screen.getByText(text).closest(".Notification");

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
    setOverviewError({ message: "Internal server error", status: 500 });
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

  describe("when the vault has not been indexed yet (404 + backend message)", () => {
    beforeEach(() => {
      setOverviewError({ message: VAULT_NOT_INDEXED_MESSAGE, status: 404 });
      setAllocations();
      vi.mocked(useVaultStatus).mockReturnValue(readyView(apiHealth()));
    });

    it("shows a neutral notice with the agreed wording and no stated cause", () => {
      render(<Vault />);

      const notice = notification(/hasn't been indexed yet/);
      expect(notice).toHaveClass("Notification--primary");
      expect(notice).not.toHaveClass("Notification--error");
      expect(notice?.textContent?.replace(/\s+/g, " ")).toBe(
        `Vault not indexed${NOT_INDEXED_TEXT}`,
      );
    });

    it("shows nothing in the error style", () => {
      const { container } = render(<Vault />);

      expect(screen.queryByText(/could not load this vault/i)).not.toBeInTheDocument();
      expect(container.querySelector(".Notification--error")).toBeNull();
    });

    it("still lists the recipient allocations", () => {
      render(<Vault />);

      const table = screen.getByRole("table", { name: /recipients and allocations/i });
      expect(table).toHaveTextContent("2.5");
      expect(screen.getByTitle(RECIPIENT)).toBeInTheDocument();
      // Cancelling needs the overview (deadline, admin), so it is off, with a reason.
      expect(screen.queryByRole("button", { name: /cancel the allocation/i })).toBeNull();
      expect(screen.getByRole("note")).toHaveTextContent(
        "Allocations can't be cancelled until this vault has been indexed.",
      );
    });

    it("does not claim nobody was registered when the list is empty", () => {
      vi.mocked(useVaultAllocations).mockReturnValue({
        data: { allocations: [] },
        isLoading: false,
        error: null,
      } as unknown as AllocationsResult);

      render(<Vault />);

      expect(
        screen.getByText("No allocations have been indexed for this vault yet."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/nobody has been registered/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/no recipients yet/i)).not.toBeInTheDocument();
    });

    it("still shows the indexer status indicator", () => {
      render(<Vault />);

      expect(screen.getByRole("status")).toHaveTextContent("Indexer: Healthy");
    });

    it("leaves out everything that needs the overview", () => {
      render(<Vault />);

      expect(screen.queryByRole("button", { name: /connect freighter/i })).toBeNull();
      expect(screen.queryByTestId("vault-balance")).toBeNull();
    });
  });

  describe.each([
    ["the wrong-contract 404", { message: "Vault not found.", status: 404 }],
    [
      "the not-indexed message with another status",
      { message: VAULT_NOT_INDEXED_MESSAGE, status: 500 },
    ],
    ["the not-indexed message with no status", { message: VAULT_NOT_INDEXED_MESSAGE }],
    [
      "the unregistered-route 404",
      {
        message: "The server returned an unexpected response (HTTP 404). Please try again.",
        status: 404,
      },
    ],
  ])("on %s", (_label, error) => {
    it("keeps the existing red error, with the indicator", () => {
      setOverviewError(error);
      setAllocations();
      vi.mocked(useVaultStatus).mockReturnValue(readyView(apiHealth()));

      render(<Vault />);

      const notice = notification(/could not load this vault/i);
      expect(notice).toHaveClass("Notification--error");
      expect(notice).toHaveTextContent(error.message);
      expect(screen.queryByText(/hasn't been indexed yet/)).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Indexer: Healthy");
    });
  });

  it("keeps the default empty state on the normal page", () => {
    setOverview({ isLoading: false, error: null, data: loadedOverview() });
    vi.mocked(useVaultStatus).mockReturnValue(readyView(apiHealth()));

    render(<Vault />);

    expect(screen.getByText(/nobody has been registered/i)).toBeInTheDocument();
    expect(screen.queryByText(/have been indexed for this vault yet/)).not.toBeInTheDocument();
  });

  it("renders the full page, unchanged, when the overview loads", () => {
    setOverview({
      isLoading: false,
      error: null,
      data: loadedOverview(),
    });
    setAllocations();
    vi.mocked(useVaultStatus).mockReturnValue(readyView(apiHealth()));

    const { container } = render(<Vault />);

    expect(screen.getByRole("button", { name: /connect freighter/i })).toBeInTheDocument();
    expect(screen.getByTestId("vault-balance")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /recipients and allocations/i })).toBeInTheDocument();
    expect(screen.queryByText(/hasn't been indexed yet/)).not.toBeInTheDocument();
    expect(container.querySelector(".Notification--error")).toBeNull();
  });
});
