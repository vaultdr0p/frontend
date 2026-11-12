import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VaultOverviewPanel } from "@/components/Vault/VaultOverviewPanel";

import { mapIndexerStatus } from "@/helpers/vaultApi";

import type { VaultOverview } from "@/types/vault";

const overview = (overrides: Partial<VaultOverview> = {}): VaultOverview => ({
  contractId: "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53",
  admin: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
  token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  deadline: new Date("2026-12-02T10:25:10Z"),
  isExpired: false,
  totalAllocated: BigInt(0),
  totalClaimed: BigInt(50_000_000),
  balance: BigInt(60_000_000),
  available: BigInt(60_000_000),
  source: "events",
  bootstrapLedger: null,
  indexer: mapIndexerStatus({
    status: "healthy",
    last_ledger: 1,
    latest_ledger: 1,
    lag_ledgers: 0,
    last_indexed_at: null,
    gap_from_ledger: null,
    gap_to_ledger: null,
    degraded_reason: null,
  }),
  ...overrides,
});

describe("VaultOverviewPanel", () => {
  describe("source note", () => {
    it("says a snapshot was read from the contract, and at which ledger", () => {
      render(
        <VaultOverviewPanel
          overview={overview({ source: "snapshot", bootstrapLedger: 5678743 })}
        />,
      );

      expect(
        screen.getByText(`Summary read from the contract at ledger ${(5678743).toLocaleString()}.`),
      ).toBeInTheDocument();
    });

    it("does not invent a ledger when the snapshot did not report one", () => {
      render(
        <VaultOverviewPanel overview={overview({ source: "snapshot", bootstrapLedger: null })} />,
      );

      expect(screen.getByText("Summary read from the contract.")).toBeInTheDocument();
      expect(screen.queryByText(/at ledger/)).not.toBeInTheDocument();
    });

    it.each(["events", "unknown"] as const)("is absent for source %s", (source) => {
      render(<VaultOverviewPanel overview={overview({ source, bootstrapLedger: 123 })} />);

      expect(screen.queryByText(/summary read from the contract/i)).not.toBeInTheDocument();
    });
  });

  describe("figures", () => {
    it("renders each value and its note as separate elements", () => {
      render(<VaultOverviewPanel overview={overview()} />);

      const balance = screen.getByTestId("vault-balance");
      expect(balance).toHaveTextContent(/^6$/);
      expect(balance).toHaveClass("VaultFigures__value");
      const note = screen.getByText("Everything the vault holds");
      expect(note).toHaveClass("VaultFigures__note");
      expect(note).not.toBe(balance);
    });

    // Found in the live check: the browser read "6Everything the vault holds"
    // as one word. Layout stacks the two visually; only a text separator keeps
    // them apart for screen readers.
    it("keeps value and note two words in the text a screen reader reads", () => {
      const { container } = render(<VaultOverviewPanel overview={overview()} />);

      const definitions = Array.from(container.querySelectorAll(".VaultFigures dd")).map(
        (dd) => dd.textContent,
      );
      expect(definitions).toEqual([
        "6 Everything the vault holds",
        "0 Reserved for unclaimed recipients",
        "5 Collected by recipients so far",
        "6 Withdrawable by the admin",
      ]);
    });
  });
});
