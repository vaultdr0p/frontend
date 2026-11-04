import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndexerStatusBanner, describeLag } from "@/components/Vault/IndexerStatusBanner";

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

describe("describeLag", () => {
  it.each([
    [0, "up to date"],
    [1, "up to date"],
    [6, "about 30 seconds behind"],
    [60, "about 5 minutes behind"],
    [2_000, "about 3 hours behind"],
  ])("describes %i ledgers as %s", (ledgers, expected) => {
    expect(describeLag(ledgers)).toBe(expected);
  });
});

describe("IndexerStatusBanner", () => {
  it("shows nothing when the indexer is healthy and current", () => {
    const { container } = render(<IndexerStatusBanner indexer={healthy} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("warns when the data is lagging, without claiming a gap", () => {
    render(<IndexerStatusBanner indexer={{ ...healthy, lagLedgers: 600 }} />);

    expect(screen.getByText(/catching up/i)).toBeInTheDocument();
    expect(screen.getByText(/about 50 minutes behind/i)).toBeInTheDocument();
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument();
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
