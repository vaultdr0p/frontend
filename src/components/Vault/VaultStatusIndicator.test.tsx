import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VaultStatusIndicator } from "@/components/Vault/VaultStatusIndicator";

import {
  ALL_HEALTH_CASES,
  apiHealth,
  loadingView,
  readyView,
  rpcDownNulls,
  unavailableView,
} from "@/helpers/vaultStatusFixtures";

const EXPECTED_LABEL: Record<string, string> = {
  none: "Indexer: Healthy",
  lag_over_threshold: "Indexer: Lagging",
  no_recent_commit: "Indexer: Stalled",
  rpc_unreachable: "Indexer: Stalled",
  never_indexed: "Indexer: First sync pending",
};

const CHECKED_AT = new Date("2026-11-11T09:20:30Z");

describe("VaultStatusIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(CHECKED_AT.getTime() + 10_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(ALL_HEALTH_CASES)("$status / $reason", ({ reason, api }) => {
    it("states the status in text inside a polite live region", () => {
      render(<VaultStatusIndicator view={readyView(api)} />);

      const region = screen.getByRole("status");
      expect(region).toHaveTextContent(EXPECTED_LABEL[reason]);
      // role="status" is implicitly aria-live="polite"; no assertive override.
      expect(region).not.toHaveAttribute("aria-live", "assertive");
    });

    it("pairs the text with a decorative icon, never colour alone", () => {
      render(<VaultStatusIndicator view={readyView(api)} />);

      const icon = screen.getByRole("status").querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("keeps the changing numbers and the clock out of the live region", () => {
      render(<VaultStatusIndicator view={readyView(api)} />);

      const region = screen.getByRole("status");
      expect(region).not.toHaveTextContent(/checked/i);
      expect(region).not.toHaveTextContent(/ledgers/i);
    });
  });

  it("separates the label and the reason with a space in the accessible text", () => {
    render(
      <VaultStatusIndicator
        view={readyView(apiHealth({ status: "stalled", reason: "no_recent_commit" }))}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe(
      "Indexer: Stalled The indexer has stopped updating.",
    );
  });

  it("shows healthy figures and the check time", () => {
    render(<VaultStatusIndicator view={readyView(apiHealth())} />);

    expect(screen.getByTestId("vault-status-lag")).toHaveTextContent("2 ledgers (~10 s)");
    expect(screen.getByTestId("vault-status-headroom")).toHaveTextContent("120,958 ledgers");
    expect(screen.getByTestId("vault-status-checked")).toHaveTextContent("checked 10 s ago");
  });

  it("renders null RPC-derived fields as unknown, never 0", () => {
    render(
      <VaultStatusIndicator
        view={readyView(
          apiHealth({ status: "stalled", reason: "rpc_unreachable", ...rpcDownNulls }),
        )}
      />,
    );

    expect(screen.getByTestId("vault-status-lag")).toHaveTextContent(/^unknown$/);
    expect(screen.getByTestId("vault-status-headroom")).toHaveTextContent(/^unknown$/);
    expect(screen.queryByText(/\b0 ledgers\b/)).not.toBeInTheDocument();
  });

  it("says when no event has been indexed yet", () => {
    render(<VaultStatusIndicator view={readyView(apiHealth({ last_event_at: null }))} />);

    expect(screen.getByTestId("vault-status-last-event")).toHaveTextContent("none yet");
  });

  it("shows Status unavailable, and nothing healthy, when the check failed", () => {
    render(<VaultStatusIndicator view={unavailableView} />);

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Indexer: Status unavailable");
    expect(region).toHaveTextContent(/health is not known/i);
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("vault-status-lag")).not.toBeInTheDocument();
  });

  it("shows a neutral checking state while loading", () => {
    render(<VaultStatusIndicator view={loadingView} />);

    expect(screen.getByRole("status")).toHaveTextContent("Indexer: Checking…");
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
  });

  it("keeps the relative check time current", () => {
    render(<VaultStatusIndicator view={readyView(apiHealth())} />);
    const checked = within(screen.getByTestId("vault-status-checked"));
    expect(checked.getByText("checked 10 s ago")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(checked.getByText("checked 1 min ago")).toBeInTheDocument();
  });
});
