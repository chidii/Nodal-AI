"use strict";
/**
 * tests/x402.test.ts
 *
 * Comprehensive test suite for X402PaymentTool.
 * Covers: valid flow, schema validation, expiry, edge cases,
 * network failures during payment, and proof structure integrity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const X402PaymentTool_1 = require("../backend/tools/X402PaymentTool");
const StellarPaymentTool_1 = require("../backend/tools/StellarPaymentTool");
// ─── Mock StellarPaymentTool so x402 tests don't hit Horizon ─────────────────
vitest_1.vi.mock("../backend/tools/StellarPaymentTool", () => ({
    StellarPaymentTool: vitest_1.vi.fn().mockImplementation(() => ({
        publicKey: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        execute: vitest_1.vi.fn().mockResolvedValue({ txHash: "x402_mock_tx_hash", ledger: 99 }),
    })),
}));
vitest_1.vi.mock("../backend/config", () => ({
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
// ─── Fixtures ─────────────────────────────────────────────────────────────────
const TEST_SECRET = "SBPTNBEQQVQD5NIPZTCXHKM5ZVONK2ENLP5DTZJBGSUPOPWQSIFWZKX";
const VALID_PAY_TO = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const VALID_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
function futureIso(offsetMs = 60_000) {
    return new Date(Date.now() + offsetMs).toISOString();
}
const VALID_CHALLENGE = {
    resource: "https://api.example.com/data",
    amount: "1.5000000",
    assetCode: "USDC",
    assetIssuer: VALID_ISSUER,
    payTo: VALID_PAY_TO,
    nonce: "550e8400-e29b-41d4-a716-446655440000",
    expiresAt: futureIso(),
};
// ─── Tests ────────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("X402PaymentTool", () => {
    let tool;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        tool = new X402PaymentTool_1.X402PaymentTool(TEST_SECRET);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    // ── Schema validation ───────────────────────────────────────────────────────
    (0, vitest_1.describe)("Schema validation", () => {
        (0, vitest_1.it)("rejects a challenge with a missing nonce", async () => {
            const { nonce: _omit, ...noNonce } = VALID_CHALLENGE;
            await (0, vitest_1.expect)(tool.respond(noNonce)).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects a non-UUID nonce", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, nonce: "not-a-uuid" })).rejects.toThrow(/UUID/);
        });
        (0, vitest_1.it)("rejects a missing resource URL", async () => {
            const { resource: _omit, ...noResource } = VALID_CHALLENGE;
            await (0, vitest_1.expect)(tool.respond(noResource)).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects a non-URL resource field", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, resource: "not-a-url" })).rejects.toThrow(/URL/);
        });
        (0, vitest_1.it)("rejects a payTo address that is too short", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, payTo: "GBBD47" })).rejects.toThrow(/Stellar address/);
        });
        (0, vitest_1.it)("rejects missing expiresAt field", async () => {
            const { expiresAt: _omit, ...noExpiry } = VALID_CHALLENGE;
            await (0, vitest_1.expect)(tool.respond(noExpiry)).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects an expiresAt that is not a valid ISO datetime", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, expiresAt: "not-a-date" })).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects a completely empty object", async () => {
            await (0, vitest_1.expect)(tool.respond({})).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects null input", async () => {
            await (0, vitest_1.expect)(tool.respond(null)).rejects.toThrow();
        });
    });
    // ── Expiry guard ─────────────────────────────────────────────────────────────
    (0, vitest_1.describe)("Expiry guard", () => {
        (0, vitest_1.it)("rejects a challenge expired 1 ms ago", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, expiresAt: new Date(Date.now() - 1).toISOString() })).rejects.toThrow(/expired/);
        });
        (0, vitest_1.it)("rejects a challenge expired 1 hour ago", async () => {
            await (0, vitest_1.expect)(tool.respond({ ...VALID_CHALLENGE, expiresAt: new Date(Date.now() - 3_600_000).toISOString() })).rejects.toThrow(/expired/);
        });
        (0, vitest_1.it)("accepts a challenge expiring 1 ms from now", async () => {
            const proof = await tool.respond({
                ...VALID_CHALLENGE,
                expiresAt: futureIso(1),
            });
            (0, vitest_1.expect)(proof.txHash).toBeTruthy();
        });
    });
    // ── Happy path ──────────────────────────────────────────────────────────────
    (0, vitest_1.describe)("Happy path", () => {
        (0, vitest_1.it)("returns a valid x402 payment proof structure", async () => {
            const proof = await tool.respond(VALID_CHALLENGE);
            (0, vitest_1.expect)(proof.protocol).toBe("x402");
            (0, vitest_1.expect)(proof.network).toBe("testnet");
            (0, vitest_1.expect)(proof.txHash).toBe("x402_mock_tx_hash");
            (0, vitest_1.expect)(proof.nonce).toBe(VALID_CHALLENGE.nonce);
            (0, vitest_1.expect)(proof.payer).toMatch(/^G[A-Z2-7]{55}$/);
            (0, vitest_1.expect)(proof.signedAt).toBeTruthy();
            (0, vitest_1.expect)(new Date(proof.signedAt).getTime()).toBeLessThanOrEqual(Date.now());
        });
        (0, vitest_1.it)("embeds nonce in memo (first 28 chars)", async () => {
            await tool.respond(VALID_CHALLENGE);
            const mockPaymentTool = vitest_1.vi.mocked(StellarPaymentTool_1.StellarPaymentTool).mock.results[0].value;
            const callArg = mockPaymentTool.execute.mock.calls[0][0];
            (0, vitest_1.expect)(callArg.memo).toBe(VALID_CHALLENGE.nonce.slice(0, 28));
        });
        (0, vitest_1.it)("delegates to StellarPaymentTool with correct destination and amount", async () => {
            await tool.respond(VALID_CHALLENGE);
            const mockPaymentTool = vitest_1.vi.mocked(StellarPaymentTool_1.StellarPaymentTool).mock.results[0].value;
            (0, vitest_1.expect)(mockPaymentTool.execute).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                destination: VALID_CHALLENGE.payTo,
                amount: VALID_CHALLENGE.amount,
                assetCode: VALID_CHALLENGE.assetCode,
                assetIssuer: VALID_CHALLENGE.assetIssuer,
            }));
        });
        (0, vitest_1.it)("omits assetIssuer for XLM payments", async () => {
            await tool.respond({ ...VALID_CHALLENGE, assetCode: "XLM" });
            const mockPaymentTool = vitest_1.vi.mocked(StellarPaymentTool_1.StellarPaymentTool).mock.results[0].value;
            const callArg = mockPaymentTool.execute.mock.calls[0][0];
            (0, vitest_1.expect)(callArg.assetIssuer).toBeUndefined();
        });
        (0, vitest_1.it)("calls StellarPaymentTool.execute exactly once per challenge", async () => {
            await tool.respond(VALID_CHALLENGE);
            const mockPaymentTool = vitest_1.vi.mocked(StellarPaymentTool_1.StellarPaymentTool).mock.results[0].value;
            (0, vitest_1.expect)(mockPaymentTool.execute).toHaveBeenCalledOnce();
        });
    });
    // ── Payment failure propagation ─────────────────────────────────────────────
    (0, vitest_1.describe)("Payment failure propagation", () => {
        function getMockExecute() {
            return vitest_1.vi.mocked(StellarPaymentTool_1.StellarPaymentTool).mock.results[0].value.execute;
        }
        (0, vitest_1.it)("propagates insufficient funds from underlying payment", async () => {
            getMockExecute().mockRejectedValueOnce(new Error("Horizon: op_underfunded — insufficient balance"));
            await (0, vitest_1.expect)(tool.respond(VALID_CHALLENGE)).rejects.toThrow(/underfunded/);
        });
        (0, vitest_1.it)("propagates network timeout from underlying payment", async () => {
            getMockExecute().mockRejectedValueOnce(new Error("ECONNABORTED: network timeout"));
            await (0, vitest_1.expect)(tool.respond(VALID_CHALLENGE)).rejects.toThrow(/timeout/);
        });
        (0, vitest_1.it)("propagates trust line missing error", async () => {
            getMockExecute().mockRejectedValueOnce(new Error("Horizon: op_no_trust — recipient missing trust line for USDC"));
            await (0, vitest_1.expect)(tool.respond(VALID_CHALLENGE)).rejects.toThrow(/no_trust/);
        });
    });
});
//# sourceMappingURL=x402.test.js.map