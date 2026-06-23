/**
 * tests/rpc_client.test.ts
 *
 * Tests for withRetry and DEFAULT_IS_RETRYABLE in backend/rpc_client.ts.
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import { withRetry, DEFAULT_IS_RETRYABLE } from "../backend/rpc_client";

vi.mock("../backend/config", () => ({
  config: {
    STELLAR_NETWORK: "testnet",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    AGENT_SECRET_KEY: "SBPTNBEQQVQD5NIPZTCXHKM5ZVONK2ENLP5DTZJBGSUPOPWQSIFWZKX",
    X402_ASSET_CODE: "USDC",
    X402_ASSET_ISSUER: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 100,
  },
}));

// ─── DEFAULT_IS_RETRYABLE ─────────────────────────────────────────────────────

describe("DEFAULT_IS_RETRYABLE", () => {
  it("returns false for ZodError", () => {
    expect(DEFAULT_IS_RETRYABLE(new ZodError([]))).toBe(false);
  });

  it("returns false for TypeError", () => {
    expect(DEFAULT_IS_RETRYABLE(new TypeError("bad type"))).toBe(false);
  });

  it("returns true for a generic Error", () => {
    expect(DEFAULT_IS_RETRYABLE(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("returns true for a plain string error", () => {
    expect(DEFAULT_IS_RETRYABLE("network failure")).toBe(true);
  });
});

// ─── withRetry ────────────────────────────────────────────────────────────────

describe("withRetry", () => {
  it("throws ZodError immediately without retrying", async () => {
    const zodError = z.string().safeParse(42).error!;
    const fn = vi.fn().mockRejectedValue(zodError);

    await expect(withRetry(fn, 3, 0)).rejects.toBeInstanceOf(ZodError);
    // Deterministic failure — must not retry at all
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws TypeError immediately without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("cannot read property"));

    await expect(withRetry(fn, 3, 0)).rejects.toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries the full MAX_RETRIES times for a transient error (e.g. HTTP 503)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(withRetry(fn, 3, 0)).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("resolves on the first successful attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn, 3, 0)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resolves after a transient failure followed by success", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered");

    await expect(withRetry(fn, 3, 0)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
