import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndexerStatusBanner } from "@/components/Vault/IndexerStatusBanner";

import {
  ALL_HEALTH_CASES,
  apiHealth,
  loadingView,
  readyView,
  rpcDownNulls,
  unavailableView,
} from "@/helpers/vaultStatusFixtures";

import type { IndexerStatus } from "@/types/vault";

const healthy: IndexerStatus = {
  status: "healthy",
  isDegraded: false,
  lastLedger: 1_000,
  latestLedger: 1_001,
  lagLedgers: 1,
  lastIndexedAt: new Date("2026-11-04T10:00:00Z"),
  gapFromLedger: null,
  gapToLedger: null,
  degradedReason: null,
};

describe("IndexerStatusBanner", () => {
  it("shows nothing when the indexer is healthy and current", () => {
    const { container } = render(<IndexerStatusBanner indexer={healthy} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the status check is healthy", () => {
    const { container } = render(
      <IndexerStatusBanner indexer={healthy} health={readyView(apiHealth())} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // The old lag message keyed on the embedded indexer's lag_ledgers, which the
  // backend always reports as 0. Lag now comes only from the status endpoint.
  it("does not warn from the embedded indexer's lag field", () => {
    const { container } = render(<IndexerStatusBanner indexer={{ ...healthy, lagLedgers: 600 }} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("per status reason", () => {
    // Expected title, notification variant class, and a phrase that must be in the body.
    const expected: Record<string, { title: RegExp; variant: string; body: RegExp } | null> = {
      none: null,
      lag_over_threshold: {
        title: /catching up/i,
        variant: "warning",
        body: /120 ledgers \(~10 min\)/,
      },
      no_recent_commit: {
        title: /stopped updating/i,
        variant: "warning",
        body: /as of the last successful update/i,
      },
      rpc_unreachable: {
        title: /stellar rpc cannot be reached/i,
        variant: "warning",
        body: /how far behind this data is is unknown/i,
      },
      never_indexed: {
        title: /first sync pending/i,
        variant: "primary",
        body: /if this does not change after a few minutes, the indexer may not be running/i,
      },
    };

    it.each(ALL_HEALTH_CASES)("$status / $reason", ({ reason, api }) => {
      const { container } = render(
        <IndexerStatusBanner indexer={healthy} health={readyView(api)} />,
      );
      const want = expected[reason];

      if (want === null) {
        expect(container).toBeEmptyDOMElement();
        return;
      }
      expect(screen.getByText(want.title)).toBeInTheDocument();
      expect(screen.getByText(want.body, { exact: false })).toBeInTheDocument();
      expect(container.querySelector(`.Notification--${want.variant}`)).not.toBeNull();
    });

    it("keeps first sync neutral, never a warning or an error", () => {
      const neverIndexed = ALL_HEALTH_CASES.find((c) => c.reason === "never_indexed")!;
      const { container } = render(
        <IndexerStatusBanner indexer={healthy} health={readyView(neverIndexed.api)} />,
      );

      expect(container.querySelector(".Notification--warning")).toBeNull();
      expect(container.querySelector(".Notification--error")).toBeNull();
    });

    it("says unknown, not 0, when lag fields are null", () => {
      render(
        <IndexerStatusBanner
          indexer={healthy}
          health={readyView(
            apiHealth({ status: "lagging", reason: "lag_over_threshold", ...rpcDownNulls }),
          )}
        />,
      );

      const notice = screen.getByText(/catching up/i).closest(".Notification") as HTMLElement;
      expect(notice).toHaveTextContent(/is unknown behind/);
      expect(notice).toHaveTextContent(/headroom: unknown/);
      expect(notice).not.toHaveTextContent(/\b0 ledgers/);
    });
  });

  it.each([
    ["unavailable", unavailableView],
    ["loading", loadingView],
  ])("adds nothing for a %s status (the indicator shows it)", (_, view) => {
    const { container } = render(<IndexerStatusBanner indexer={healthy} health={view} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the gap and the live status together", () => {
    render(
      <IndexerStatusBanner
        indexer={{
          ...healthy,
          status: "degraded",
          isDegraded: true,
          gapFromLedger: 1,
          gapToLedger: 9,
        }}
        health={readyView(apiHealth({ status: "stalled", reason: "no_recent_commit" }))}
      />,
    );

    expect(screen.getByText(/history is missing/i)).toBeInTheDocument();
    expect(screen.getByText(/stopped updating/i)).toBeInTheDocument();
  });

  describe("when degraded", () => {
    const degraded: IndexerStatus = {
      ...healthy,
      status: "degraded",
      isDegraded: true,
      gapFromLedger: 1_000,
      gapToLedger: 1_500,
      degradedReason: "start ledger outside the retention window",
    };

    it("states the gap bounds", () => {
      render(<IndexerStatusBanner indexer={degraded} />);

      expect(screen.getByText(/history is missing/i)).toBeInTheDocument();
      expect(screen.getByText("1,000")).toBeInTheDocument();
      expect(screen.getByText("1,500")).toBeInTheDocument();
    });

    // The point of the banner: a reader must come away knowing the history is
    // incomplete *and* that the money figures are still trustworthy.
    it("explains the consequence in plain language", () => {
      render(<IndexerStatusBanner indexer={degraded} />);

      expect(screen.getByText(/501 ledgers/)).toBeInTheDocument();
      expect(screen.getByText(/cannot be recovered/i)).toBeInTheDocument();
      expect(screen.getByText(/still correct/i)).toBeInTheDocument();
    });

    it("reports the backend's reason when given one", () => {
      render(<IndexerStatusBanner indexer={degraded} />);

      expect(screen.getByText(/start ledger outside the retention window/i)).toBeInTheDocument();
    });

    it("still explains itself when the bounds are unknown", () => {
      render(
        <IndexerStatusBanner indexer={{ ...degraded, gapFromLedger: null, gapToLedger: null }} />,
      );

      expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
      // No bounds means no ledger numbers invented.
      expect(screen.queryByText(/between ledger/i)).not.toBeInTheDocument();
    });
  });
});
