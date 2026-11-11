import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchApi } from "@/helpers/fetchApi";
import { VAULT_NOT_INDEXED_MESSAGE, isVaultNotIndexedError } from "@/helpers/vaultApi";

import type { AppError } from "@/types";

/**
 * The backend's three 404s on vault routes, byte-for-byte as the local stack
 * returned them (backend d3955006). The first two come from
 * internal/serve/httphandler/vault_handler.go; the third is the router's own
 * answer when ENABLE_VAULT is off and the routes are not registered.
 */
const NOT_INDEXED_BODY = '{"error":"Vault has not been indexed yet."}';
const NOT_FOUND_BODY = '{"error":"Vault not found."}';
const ROUTE_MISSING_BODY = "404 page not found\n";

const respond = (status: number, body: string, contentType: string) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status, headers: { "Content-Type": contentType } }));

/** Runs one request through fetchApi exactly as useVaultOverview does, returning what it throws. */
const errorFrom = async (status: number, body: string, contentType: string): Promise<AppError> => {
  respond(status, body, contentType);
  try {
    await fetchApi("http://localhost:8000/vault/C1", undefined, { withoutAuth: true });
  } catch (error) {
    return error as AppError;
  }
  throw new Error("fetchApi did not throw");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VAULT_NOT_INDEXED_MESSAGE", () => {
  // Contract pin. This string is coupled to the backend's message: if either
  // side rewords it, the neutral "not indexed" state silently degrades to the
  // red error. Changing this test is a signal to change the backend message in
  // the same breath (or, better, to move to a vault_not_indexed error code).
  it("is exactly the backend's message", () => {
    expect(VAULT_NOT_INDEXED_MESSAGE).toBe("Vault has not been indexed yet.");
    expect(JSON.parse(NOT_INDEXED_BODY).error).toBe(VAULT_NOT_INDEXED_MESSAGE);
  });
});

describe("fetchApi keeps the HTTP status on errors", () => {
  it("on a JSON {error} body", async () => {
    const error = await errorFrom(404, NOT_INDEXED_BODY, "application/json");
    expect(error).toEqual({ message: VAULT_NOT_INDEXED_MESSAGE, extras: undefined, status: 404 });
  });

  it("on JSON without an error field", async () => {
    const error = await errorFrom(500, '{"unexpected":true}', "application/json");
    expect(error.status).toBe(500);
    expect(error.message).toBe("The request failed (HTTP 500). Please try again.");
  });

  it("on a non-JSON body", async () => {
    const error = await errorFrom(404, ROUTE_MISSING_BODY, "text/plain; charset=utf-8");
    expect(error.status).toBe(404);
    expect(error.message).toBe(
      "The server returned an unexpected response (HTTP 404). Please try again.",
    );
  });
});

describe("isVaultNotIndexedError", () => {
  it("matches the backend's not-indexed 404 end to end", async () => {
    expect(isVaultNotIndexedError(await errorFrom(404, NOT_INDEXED_BODY, "application/json"))).toBe(
      true,
    );
  });

  it.each([
    ["the wrong-contract 404", 404, NOT_FOUND_BODY, "application/json"],
    ["the unregistered-route 404 (feature off)", 404, ROUTE_MISSING_BODY, "text/plain"],
    ["the same message with another status", 500, NOT_INDEXED_BODY, "application/json"],
  ])("does not match %s", async (_label, status, body, contentType) => {
    expect(isVaultNotIndexedError(await errorFrom(status, body, contentType))).toBe(false);
  });

  it.each([
    ["no status (an error not from an HTTP response)", { message: VAULT_NOT_INDEXED_MESSAGE }],
    ["a reworded message", { message: "Vault has not been indexed yet", status: 404 }],
    ["a different case", { message: "vault has not been indexed yet.", status: 404 }],
    ["null", null],
    ["undefined", undefined],
  ])("does not match %s", (_label, error) => {
    expect(isVaultNotIndexedError(error)).toBe(false);
  });
});
