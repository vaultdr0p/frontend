import { describe, expect, it } from "vitest";

import {
  isFullyIndexed,
  parseSummarySource,
  mapAllocation,
  mapAllocationsResponse,
  mapIndexerStatus,
  mapTransactionSummary,
  mapVaultOverview,
  parseApiAmount,
  parseApiDate,
  parseNullableApiAmount,
} from "@/helpers/vaultApi";

import type { ApiIndexerStatus, ApiVaultOverview } from "@/types/vault";

const healthyIndexer: ApiIndexerStatus = {
  status: "healthy",
  last_ledger: 1_000,
  latest_ledger: 1_001,
  lag_ledgers: 1,
  last_indexed_at: "2026-11-04T10:00:00Z",
  gap_from_ledger: null,
  gap_to_ledger: null,
  degraded_reason: null,
};

describe("parseApiAmount", () => {
  it("reads a decimal string as stroops", () => {
    expect(parseApiAmount("100000000", "balance")).toBe(BigInt("100000000"));
  });

  // The whole reason amounts are strings on the wire: this value is larger
  // than Number.MAX_SAFE_INTEGER, so any float path would corrupt it.
  it("preserves a value beyond Number.MAX_SAFE_INTEGER exactly", () => {
    const huge = "170141183460469231731687303715884105727";

    const parsed = parseApiAmount(huge, "balance");

    expect(parsed.toString()).toBe(huge);
    // Proof that the naive conversion would have lost information.
    expect(Number(huge).toString()).not.toBe(huge);
  });

  it.each([
    ["a float", "1.5"],
    ["scientific notation", "1e7"],
    ["a negative value", "-1"],
    ["hex", "0x10"],
    ["separators", "1_000"],
    ["empty", ""],
    ["whitespace padding", " 100 "],
  ])("rejects %s rather than coercing it", (_label, value) => {
    expect(() => parseApiAmount(value, "balance")).toThrow(/unreadable amount for balance/);
  });

  it("tolerates null only where the spec allows it", () => {
    expect(parseNullableApiAmount(null, "available")).toBeNull();
    expect(parseNullableApiAmount("7", "available")).toBe(BigInt(7));
  });
});

describe("parseApiDate", () => {
  it("parses an RFC 3339 timestamp", () => {
    expect(parseApiDate("2026-11-04T10:00:00Z")?.toISOString()).toBe("2026-11-04T10:00:00.000Z");
  });

  it.each([null, undefined, "", "not-a-date"])("returns null for %s", (value) => {
    expect(parseApiDate(value)).toBeNull();
  });
});

describe("mapIndexerStatus", () => {
  it("derives isDegraded from the status enum", () => {
    expect(mapIndexerStatus(healthyIndexer).isDegraded).toBe(false);
    expect(mapIndexerStatus({ ...healthyIndexer, status: "degraded" }).isDegraded).toBe(true);
  });

  it("carries the gap bounds through", () => {
    const mapped = mapIndexerStatus({
      ...healthyIndexer,
      status: "degraded",
      gap_from_ledger: 500,
      gap_to_ledger: 900,
      degraded_reason: "start ledger outside the retention window",
    });

    expect(mapped.gapFromLedger).toBe(500);
    expect(mapped.gapToLedger).toBe(900);
    expect(mapped.degradedReason).toBe("start ledger outside the retention window");
  });
});

describe("mapVaultOverview", () => {
  const overview: ApiVaultOverview = {
    contract_id: "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53",
    admin: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    deadline: "2026-12-01T00:00:00Z",
    is_expired: false,
    total_allocated: "30000000",
    total_claimed: "10000000",
    balance: "100000000",
    available: "70000000",
    indexer: healthyIndexer,
  };

  it("maps every amount to bigint", () => {
    const mapped = mapVaultOverview(overview);

    expect(mapped.totalAllocated).toBe(BigInt("30000000"));
    expect(mapped.totalClaimed).toBe(BigInt("10000000"));
    expect(mapped.balance).toBe(BigInt("100000000"));
    expect(mapped.available).toBe(BigInt("70000000"));
    expect(mapped.deadline.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  // The spec allows a null `available`; showing 0 would be a false claim about
  // how much the admin can withdraw.
  it("keeps a null available as null rather than zero", () => {
    expect(mapVaultOverview({ ...overview, available: null }).available).toBeNull();
  });

  it("fails loudly on an unreadable deadline", () => {
    expect(() => mapVaultOverview({ ...overview, deadline: "soon" })).toThrow(
      /unreadable claim deadline/,
    );
  });
});

describe("mapAllocation", () => {
  it("maps the wire shape to the domain shape", () => {
    const mapped = mapAllocation({
      recipient: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
      amount: "25000000",
      status: "CLAIMED",
      registered_at: "2026-11-01T00:00:00Z",
      registered_ledger: 10,
      settled_at: "2026-11-02T00:00:00Z",
      settled_ledger: 20,
    });

    expect(mapped.amount).toBe(BigInt("25000000"));
    expect(mapped.status).toBe("CLAIMED");
    expect(mapped.settledLedger).toBe(20);
    expect(mapped.settledAt?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("handles an unsettled allocation's nulls", () => {
    const mapped = mapAllocation({
      recipient: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
      amount: "1",
      status: "PENDING",
      registered_at: "2026-11-01T00:00:00Z",
      registered_ledger: 10,
      settled_at: null,
      settled_ledger: null,
    });

    expect(mapped.settledAt).toBeNull();
    expect(mapped.settledLedger).toBeNull();
  });
});

describe("mapAllocationsResponse", () => {
  it("substitutes a usable pagination block when one is absent", () => {
    const mapped = mapAllocationsResponse({
      data: [
        {
          recipient: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
          amount: "1",
          status: "PENDING",
          registered_at: "2026-11-01T00:00:00Z",
          registered_ledger: 1,
          settled_at: null,
          settled_ledger: null,
        },
      ],
      // The spec marks pagination required, but a missing block must not blank
      // the table.
    } as Parameters<typeof mapAllocationsResponse>[0]);

    expect(mapped.pagination).toEqual({ total: 1, page: 1, pages: 1 });
    expect(mapped.indexer).toBeNull();
  });
});

describe("mapTransactionSummary", () => {
  it("puts the effect sentence first", () => {
    const rows = mapTransactionSummary({ amount: "100", effect: "Fund the vault with 100" });

    expect(rows[0]).toEqual({ label: "Effect", value: "Fund the vault with 100" });
  });

  it("humanises snake_case keys", () => {
    expect(mapTransactionSummary({ contract_id: "CB…" })[0].label).toBe("Contract id");
  });

  it("renders a nested value as JSON rather than [object Object]", () => {
    const rows = mapTransactionSummary({ nested: { a: 1 } });

    expect(rows[0].value).toBe('{"a":1}');
  });

  it("shows an em dash for null", () => {
    expect(mapTransactionSummary({ recipient: null })[0].value).toBe("—");
  });
});

describe("summary source (backend PR #18)", () => {
  const base: ApiVaultOverview = {
    contract_id: "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53",
    admin: "GAODBHVR63Z56MVQRBEJSYM2H5423LJ4WAPUUBOFG4JYY72S6ROKVZRX",
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    deadline: "2026-12-01T00:00:00Z",
    is_expired: false,
    total_allocated: "0",
    total_claimed: "50000000",
    balance: "60000000",
    available: "60000000",
    indexer: healthyIndexer,
  };

  it.each([
    [undefined, "events"],
    [null, "events"],
    ["events", "events"],
    ["snapshot", "snapshot"],
    ["guess", "unknown"],
    ["", "unknown"],
    [7, "unknown"],
  ])("source %j is read as %s", (value, expected) => {
    expect(parseSummarySource(value)).toBe(expected);
  });

  it("reads a snapshot's source and bootstrap ledger", () => {
    const mapped = mapVaultOverview({ ...base, source: "snapshot", bootstrap_ledger: 5678743 });

    expect(mapped.source).toBe("snapshot");
    expect(mapped.bootstrapLedger).toBe(5678743);
  });

  it("treats a backend without the field as event-derived", () => {
    const mapped = mapVaultOverview(base);

    expect(mapped.source).toBe("events");
    expect(mapped.bootstrapLedger).toBeNull();
  });

  it.each([null, undefined, 0, -1, 1.5, "5678743"])(
    "reports a bootstrap ledger of %j as not reported",
    (value) => {
      const mapped = mapVaultOverview({
        ...base,
        source: "snapshot",
        bootstrap_ledger: value as number | null,
      });
      expect(mapped.bootstrapLedger).toBeNull();
    },
  );

  it("accepts a degraded indexer whose gap start is unknown (null)", () => {
    const mapped = mapVaultOverview({
      ...base,
      source: "snapshot",
      bootstrap_ledger: 5678743,
      indexer: {
        ...healthyIndexer,
        status: "degraded",
        gap_from_ledger: null,
        gap_to_ledger: 5557783,
        degraded_reason: "created before indexing began",
      },
    });

    expect(mapped.indexer.isDegraded).toBe(true);
    expect(mapped.indexer.gapFromLedger).toBeNull();
    expect(mapped.indexer.gapToLedger).toBe(5557783);
  });

  it.each([
    ["events", false, true],
    ["events", true, false],
    ["snapshot", false, false],
    ["snapshot", true, false],
    ["unknown", false, false],
    ["unknown", true, false],
  ] as const)("source %s, degraded %s: fully indexed is %s", (source, isDegraded, expected) => {
    expect(
      isFullyIndexed({ source, indexer: { ...mapIndexerStatus(healthyIndexer), isDegraded } }),
    ).toBe(expected);
  });
});
