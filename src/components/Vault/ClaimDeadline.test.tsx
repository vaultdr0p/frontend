import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClaimDeadline, formatRemaining } from "@/components/Vault/ClaimDeadline";

const NOW = new Date("2026-11-04T12:00:00Z");

describe("formatRemaining", () => {
  it.each([
    ["30 minutes", "2026-11-04T12:30:00Z", "30 minutes left to claim"],
    ["one hour", "2026-11-04T13:00:00Z", "1 hour left to claim"],
    ["five hours", "2026-11-04T17:00:00Z", "5 hours left to claim"],
    ["five days", "2026-11-09T12:00:00Z", "5 days left to claim"],
  ])("describes %s remaining", (_label, deadline, expected) => {
    expect(formatRemaining(new Date(deadline), NOW)).toBe(expected);
  });

  it("reports a passed deadline rather than a negative duration", () => {
    expect(formatRemaining(new Date("2026-11-03T12:00:00Z"), NOW)).toBe("The deadline has passed");
  });

  // The boundary belongs to cancel, not claim: the contract requires
  // now < deadline to claim.
  it("treats the exact deadline as passed", () => {
    expect(formatRemaining(NOW, NOW)).toBe("The deadline has passed");
  });
});

describe("ClaimDeadline", () => {
  it("shows the deadline as a machine-readable time", () => {
    const deadline = new Date("2026-12-01T00:00:00Z");

    render(<ClaimDeadline deadline={deadline} isExpired={false} now={NOW} />);

    const time = screen.getByText((_content, element) => element?.tagName === "TIME");
    expect(time).toHaveAttribute("dateTime", deadline.toISOString());
  });

  it("says claims are open before the deadline", () => {
    render(
      <ClaimDeadline deadline={new Date("2026-12-01T00:00:00Z")} isExpired={false} now={NOW} />,
    );

    expect(screen.getByText("Open for claims")).toBeInTheDocument();
    expect(screen.getByText(/cannot be cancelled before it/i)).toBeInTheDocument();
  });

  it("says what is permitted after the deadline", () => {
    render(<ClaimDeadline deadline={new Date("2026-10-01T00:00:00Z")} isExpired now={NOW} />);

    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText(/can no longer claim/i)).toBeInTheDocument();
    expect(screen.getByText(/can now be cancelled/i)).toBeInTheDocument();
  });
});
