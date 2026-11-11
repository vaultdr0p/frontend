import { describe, expect, it, vi } from "vitest";

import { fetchApi } from "@/helpers/fetchApi";
import { fetchVaultStatus, mapIndexerHealth } from "@/helpers/vaultApi";
import {
  formatCheckedAgo,
  formatCount,
  formatDuration,
  formatLag,
  vaultStatusKind,
} from "@/helpers/vaultStatus";
import {
  ALL_HEALTH_CASES,
  STATUS_CONTRACT_ID,
  apiHealth,
  loadingView,
  readyView,
  rpcDownNulls,
  unavailableView,
} from "@/helpers/vaultStatusFixtures";

import type { ApiIndexerHealth } from "@/types/vault";

vi.mock("@/helpers/fetchApi", () => ({ fetchApi: vi.fn() }));

describe("mapIndexerHealth", () => {
  it("maps every field, converting dates", () => {
    const health = mapIndexerHealth(apiHealth());

    expect(health).toEqual({
      contractId: STATUS_CONTRACT_ID,
      status: "ok",
      reason: "none",
      detail: "indexer is 2 ledgers behind the chain tip (threshold 60)",
      isDegraded: false,
      cursorLedger: 812_458,
      rpcLatestLedger: 812_460,
      lagLedgers: 2,
      lagSecondsEstimate: 10,
      lastEventAt: new Date("2026-11-11T09:12:05Z"),
      retentionHeadroom: 120_958,
      checkedAt: new Date("2026-11-11T09:20:30Z"),
    });
  });

  it("keeps null RPC-derived fields null, never 0", () => {
    const health = mapIndexerHealth(
      apiHealth({ status: "stalled", reason: "rpc_unreachable", ...rpcDownNulls }),
    );

    expect(health.rpcLatestLedger).toBeNull();
    expect(health.lagLedgers).toBeNull();
    expect(health.lagSecondsEstimate).toBeNull();
    expect(health.retentionHeadroom).toBeNull();
  });

  it.each(ALL_HEALTH_CASES)("accepts the spec pair $status / $reason", ({ api }) => {
    expect(() => mapIndexerHealth(api)).not.toThrow();
  });

  // Each case asserts the specific message, so a guard that is removed and
  // happens to be backstopped by an unrelated TypeError still fails the test.
  it.each<[string, Partial<ApiIndexerHealth>, RegExp]>([
    [
      "an unknown status",
      { status: "fine" as ApiIndexerHealth["status"] },
      /unknown indexer status/,
    ],
    [
      "an unknown reason",
      { reason: "cosmic_rays" as ApiIndexerHealth["reason"] },
      /does not match its status/,
    ],
    ["ok with a failure reason", { status: "ok", reason: "rpc_unreachable" }, /does not match/],
    ["stalled with reason none", { status: "stalled", reason: "none" }, /does not match/],
    [
      "lagging with a stall reason",
      { status: "lagging", reason: "no_recent_commit" },
      /does not match/,
    ],
    ["an unreadable checked_at", { checked_at: "yesterday-ish" }, /unreadable status time/],
    ["a non-numeric lag", { lag_ledgers: "12" as unknown as number }, /unreadable lag/],
  ])("rejects %s rather than guessing", (_, overrides, message) => {
    expect(() => mapIndexerHealth(apiHealth(overrides))).toThrow(message);
  });
});

describe("fetchVaultStatus", () => {
  it("GETs /vault/{contract_id}/status through fetchApi, so auth headers are attached", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce(apiHealth());

    const health = await fetchVaultStatus(STATUS_CONTRACT_ID);

    expect(fetchApi).toHaveBeenCalledWith(
      `http://localhost:8000/vault/${STATUS_CONTRACT_ID}/status`,
    );
    expect(health.status).toBe("ok");
  });
});

describe("vaultStatusKind", () => {
  const expected: Record<string, string> = {
    none: "healthy",
    lag_over_threshold: "lagging",
    no_recent_commit: "stalled",
    rpc_unreachable: "stalled",
    never_indexed: "first_sync",
  };

  it.each(ALL_HEALTH_CASES)("$status / $reason", ({ reason, api }) => {
    expect(vaultStatusKind(readyView(api))).toBe(expected[reason]);
  });

  it("never reports a failed or pending check as healthy", () => {
    expect(vaultStatusKind(unavailableView)).toBe("unavailable");
    expect(vaultStatusKind(loadingView)).toBe("loading");
  });
});

describe("formatting", () => {
  it.each([
    [null, "unknown"],
    [0, "0"],
    [120_958, "120,958"],
  ])("formatCount(%s) is %s", (value, text) => {
    expect(formatCount(value)).toBe(text);
  });

  it.each([
    [null, null, "unknown"],
    [null, 600, "unknown"],
    [1, 5, "1 ledger (~5 s)"],
    [120, 600, "120 ledgers (~10 min)"],
    [120, null, "120 ledgers"],
  ])("formatLag(%s, %s) is %s", (ledgers, seconds, text) => {
    expect(formatLag(ledgers, seconds)).toBe(text);
  });

  it.each([
    [0, "0 s"],
    [59, "59 s"],
    [60, "1 min"],
    [3_599, "1 h"], // 59.98 min rounds to 60, which rolls over to hours
    [3_600, "1 h"],
    [172_800, "2 d"],
    [-4, "0 s"],
  ])("formatDuration(%i) is %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it("formats checked_at relative to now", () => {
    const checkedAt = new Date("2026-11-11T09:20:30Z");

    expect(formatCheckedAgo(checkedAt, new Date("2026-11-11T09:20:40Z"))).toBe("checked 10 s ago");
    expect(formatCheckedAgo(checkedAt, new Date("2026-11-11T09:25:30Z"))).toBe("checked 5 min ago");
    // A server clock slightly ahead must not produce "checked -2 s ago".
    expect(formatCheckedAgo(checkedAt, new Date("2026-11-11T09:20:28Z"))).toBe("checked 0 s ago");
  });
});
