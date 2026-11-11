import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VAULT_FEATURE_RETRY_MS,
  classifyVaultFeatureResponse,
  useVaultFeature,
} from "@/apiQueries/useVaultFeature";

import { fetchApi } from "@/helpers/fetchApi";

vi.mock("@/helpers/fetchApi", () => ({ fetchApi: vi.fn() }));
const mockFetchApi = vi.mocked(fetchApi);

const CONTRACT_ID = "CB5HTYC4GZW67ET23SACDCWCCDQ3AKU4TYX7SAUQJSKS6LLQLYA4HG53";
const PROBE_URL = `http://localhost:8000/vault/${CONTRACT_ID}/status`;

type Reply = { status: number; contentType: string } | "network-error";

const ENABLED_200: Reply = { status: 200, contentType: "application/json" };
const ENABLED_JSON_404: Reply = { status: 404, contentType: "application/json" };
const DISABLED_TEXT_404: Reply = { status: 404, contentType: "text/plain; charset=utf-8" };
const FORBIDDEN_403: Reply = { status: 403, contentType: "application/json" };
const UNAVAILABLE_503: Reply = { status: 503, contentType: "text/html" };

/**
 * Answers the probe the way the real fetchApi does when given a
 * customCallback: it hands the raw Response to the callback and returns
 * whatever the callback returns. A network error rejects before that.
 */
const replyWith = (...replies: Reply[]) => {
  for (const reply of replies) {
    mockFetchApi.mockImplementationOnce(async (_url, _init, options) => {
      if (reply === "network-error") {
        throw new TypeError("Failed to fetch");
      }
      return options!.customCallback!(
        new Response("", { status: reply.status, headers: { "Content-Type": reply.contentType } }),
      );
    });
  }
};

const Harness = ({ isEnabled = true }: { isEnabled?: boolean }) => {
  const isVaultEnabled = useVaultFeature(CONTRACT_ID, isEnabled);
  return <p>{isVaultEnabled ? "vault: shown" : "vault: hidden"}</p>;
};

/** Same flush sequence as useVaultStatus.test.tsx; see the comment there for why. */
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

let client: QueryClient;

/** Mounts a fresh Harness on the shared client, as each navigation mounts a new InnerPage. */
const mount = async (isEnabled = true) => {
  const utils = render(
    <QueryClientProvider client={client}>
      <Harness isEnabled={isEnabled} />
    </QueryClientProvider>,
  );
  await flush();
  return utils;
};

const probeCalls = () => mockFetchApi.mock.calls.filter(([url]) => url === PROBE_URL).length;

describe("classifyVaultFeatureResponse", () => {
  it.each([
    [200, "application/json", "enabled"],
    [204, null, "enabled"],
    [404, "application/json", "enabled"],
    [404, "application/json; charset=utf-8", "enabled"],
    [404, "text/plain; charset=utf-8", "disabled"],
    [404, "TEXT/PLAIN", "disabled"],
    [404, "text/html", "inconclusive"],
    [404, null, "inconclusive"],
    [401, "application/json", "inconclusive"],
    [403, "application/json", "inconclusive"],
    [500, "application/json", "inconclusive"],
    [503, "text/plain", "inconclusive"],
  ] as const)("HTTP %i %s → %s", (status, contentType, expected) => {
    expect(classifyVaultFeatureResponse(status, contentType)).toBe(expected);
  });
});

describe("useVaultFeature", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchApi.mockReset();
    client = new QueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });

  it("probes GET /vault/{contract_id}/status", async () => {
    replyWith(ENABLED_200);
    await mount();
    expect(mockFetchApi).toHaveBeenCalledWith(PROBE_URL, undefined, {
      customCallback: expect.any(Function),
    });
  });

  it("is hidden while the first probe is in flight", async () => {
    mockFetchApi.mockImplementationOnce(() => new Promise(() => undefined));
    await mount();
    expect(screen.getByText("vault: hidden")).toBeInTheDocument();
  });

  it("does not probe at all when disabled (role cannot open /vault)", async () => {
    replyWith(ENABLED_200);
    await mount(false);
    expect(probeCalls()).toBe(0);
    expect(screen.getByText("vault: hidden")).toBeInTheDocument();
  });

  describe.each([
    ["200", ENABLED_200, "vault: shown"],
    ["JSON 404 (vault routes exist)", ENABLED_JSON_404, "vault: shown"],
    ["plain-text 404 (vault routes not registered)", DISABLED_TEXT_404, "vault: hidden"],
  ])("a definitive %s", (_label, reply, expected) => {
    it(`renders "${expected}"`, async () => {
      replyWith(reply);
      await mount();
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("is cached for the session: no probe on later navigations or over time", async () => {
      replyWith(reply);
      const first = await mount();
      first.unmount();
      await mount();
      await flush(VAULT_FEATURE_RETRY_MS * 20);
      expect(probeCalls()).toBe(1);
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  describe.each([
    ["403", FORBIDDEN_403],
    ["5xx", UNAVAILABLE_503],
    ["network error", "network-error" as const],
  ])("an inconclusive %s", (_label, reply) => {
    it("keeps the item hidden", async () => {
      replyWith(reply);
      await mount();
      expect(screen.getByText("vault: hidden")).toBeInTheDocument();
    });

    it("is retried on the next navigation, and a definitive answer then shows the item", async () => {
      replyWith(reply, ENABLED_200);
      const first = await mount();
      expect(probeCalls()).toBe(1);
      first.unmount();

      await mount();
      expect(probeCalls()).toBe(2);
      expect(screen.getByText("vault: shown")).toBeInTheDocument();
    });

    it("is retried after a short delay without navigating", async () => {
      replyWith(reply, ENABLED_200);
      await mount();
      await flush(VAULT_FEATURE_RETRY_MS - 1);
      expect(probeCalls()).toBe(1);
      expect(screen.getByText("vault: hidden")).toBeInTheDocument();

      await flush(1);
      expect(probeCalls()).toBe(2);
      expect(screen.getByText("vault: shown")).toBeInTheDocument();
    });

    it("stops retrying once an answer is definitive", async () => {
      replyWith(reply, DISABLED_TEXT_404);
      await mount();
      await flush(VAULT_FEATURE_RETRY_MS);
      expect(probeCalls()).toBe(2);
      await flush(VAULT_FEATURE_RETRY_MS * 10);
      expect(probeCalls()).toBe(2);
      expect(screen.getByText("vault: hidden")).toBeInTheDocument();
    });
  });
});
