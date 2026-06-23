/**
 * tests/agent.test.ts
 *
 * Tests for PayFiAgent — focused on assertWithinSpendingLimit behaviour,
 * including the secondary mainnet spending cap guard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PayFiAgent } from "../backend/agent";

vi.mock("../backend/tools/StellarPaymentTool", () => ({
  StellarPaymentTool: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ txHash: "mock_hash", ledger: 1 }),
  })),
}));

vi.mock("../backend/tools/SorobanInvokeTool", () => ({
  SorobanInvokeTool: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
  })),
}));

vi.mock("../backend/tools/X402PaymentTool", () => ({
  X402PaymentTool: vi.fn().mockImplementation(() => ({
    respond: vi.fn(),
  })),
}));

vi.mock("../backend/config", () => ({
  config: {
    STELLAR_NETWORK: "mainnet",
    HORIZON_URL: "https://horizon.stellar.org",
    SOROBAN_RPC_URL: "https://soroban-mainnet.stellar.org",
    AGENT_PUBLIC_KEY: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    X402_ASSET_CODE: "USDC",
    X402_ASSET_ISSUER: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 100,
    // Set above MAINNET_SPENDING_CAP to exercise the secondary runtime guard
    AGENT_SPENDING_LIMIT: "15000",
    agentKeypair: () => ({
      secret: () => "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73",
    }),
  },
  MAINNET_SPENDING_CAP: 10_000,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PayFiAgent — mainnet spending cap", () => {
  let agent: PayFiAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new PayFiAgent();
  });

  it("rejects a stellar_payment above MAINNET_SPENDING_CAP on mainnet", async () => {
    const result = await agent.run({
      type: "stellar_payment",
      payload: {
        destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        amount: "12000",
        assetCode: "USDC",
        assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mainnet spending cap/);
  });

  it("rejects an x402_respond above MAINNET_SPENDING_CAP on mainnet", async () => {
    const result = await agent.run({
      type: "x402_respond",
      payload: {
        resource: "https://api.example.com/data",
        amount: "11000",
        assetCode: "USDC",
        assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        payTo: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        nonce: "550e8400-e29b-41d4-a716-446655440000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mainnet spending cap/);
  });

  it("accepts a stellar_payment at or below MAINNET_SPENDING_CAP on mainnet", async () => {
    const result = await agent.run({
      type: "stellar_payment",
      payload: {
        destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        amount: "9999",
        assetCode: "USDC",
        assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      },
    });

    expect(result.success).toBe(true);
  });
});
