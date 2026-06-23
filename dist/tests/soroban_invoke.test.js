"use strict";
/**
 * tests/soroban_invoke.test.ts
 *
 * Comprehensive test suite for SorobanInvokeTool.
 * Covers: simulation gate, happy path, ERROR/FAILED status handling,
 * polling timeout, invalid inputs, and dry-run mode.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const SorobanInvokeTool_1 = require("../backend/tools/SorobanInvokeTool");
const rpcClient = __importStar(require("../backend/rpc_client"));
// ─── Module mock ──────────────────────────────────────────────────────────────
vitest_1.vi.mock("../backend/rpc_client", () => ({
    loadAccount: vitest_1.vi.fn(),
    submitTransaction: vitest_1.vi.fn(),
    simulateSorobanTx: vitest_1.vi.fn(),
    prepareSorobanTx: vitest_1.vi.fn(),
    horizonServer: {},
    sorobanServer: {
        sendTransaction: vitest_1.vi.fn(),
        getTransaction: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../backend/config", () => ({
    config: {
        STELLAR_NETWORK: "testnet",
        HORIZON_URL: "https://horizon-testnet.stellar.org",
        SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
        AGENT_SECRET_KEY: "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73",
        X402_ASSET_CODE: "USDC",
        X402_ASSET_ISSUER: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        MAX_RETRIES: 3,
        RETRY_DELAY_MS: 100,
    },
}));
// ─── Fixtures ─────────────────────────────────────────────────────────────────
const TEST_SECRET = "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73";
const VALID_CONTRACT = "CDPVBHPSVYKWSI5ECEA4DASBG3RBNU5EHEE3DHNFX7RMBCZV66CSC7NH";
function makeMockAccount(publicKey) {
    return {
        id: publicKey,
        accountId: () => publicKey,
        sequenceNumber: () => "100",
        incrementSequenceNumber: vitest_1.vi.fn(),
        sequence: "100",
        incrementedSequenceNumber: () => "101",
        thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
        balances: [],
        signers: [],
        data_attr: {},
        subentry_count: 0,
    };
}
// ─── Tests ────────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("SorobanInvokeTool", () => {
    let tool;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        tool = new SorobanInvokeTool_1.SorobanInvokeTool(TEST_SECRET);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    // ── Input validation ────────────────────────────────────────────────────────
    (0, vitest_1.describe)("Input validation", () => {
        (0, vitest_1.it)("rejects a contractId that is too short", async () => {
            await (0, vitest_1.expect)(tool.execute({ contractId: "bad_id", method: "release", args: [] })).rejects.toThrow(/Invalid Stellar contract ID/);
        });
        (0, vitest_1.it)("rejects a contractId that is too long (57 chars)", async () => {
            await (0, vitest_1.expect)(tool.execute({ contractId: "C".padEnd(57, "A"), method: "release", args: [] })).rejects.toThrow(/Invalid Stellar contract ID/);
        });
        (0, vitest_1.it)("rejects an empty method name", async () => {
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "", args: [] })).rejects.toThrow();
        });
        (0, vitest_1.it)("rejects missing contractId", async () => {
            await (0, vitest_1.expect)(tool.execute({ method: "release", args: [] })).rejects.toThrow();
        });
    });
    // ── Simulation gate (mandatory) ─────────────────────────────────────────────
    (0, vitest_1.describe)("Simulation gate", () => {
        (0, vitest_1.beforeEach)(() => {
            vitest_1.vi.mocked(rpcClient.loadAccount).mockResolvedValue(makeMockAccount("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"));
        });
        (0, vitest_1.it)("calls prepareSorobanTx before any submission", async () => {
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockResolvedValue({ sign: vitest_1.vi.fn() });
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "PENDING",
                hash: "sim_test_hash",
            });
            vitest_1.vi.mocked(rpcClient.sorobanServer.getTransaction).mockResolvedValue({
                status: "SUCCESS",
            });
            await tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] });
            (0, vitest_1.expect)(rpcClient.prepareSorobanTx).toHaveBeenCalledOnce();
        });
        (0, vitest_1.it)("throws and does NOT submit when simulation fails", async () => {
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockRejectedValue(new Error("Soroban simulation failed: insufficient balance"));
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/simulation failed/);
            (0, vitest_1.expect)(rpcClient.sorobanServer.sendTransaction).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("throws when simulation fails with contract error code", async () => {
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockRejectedValue(new Error("Soroban simulation failed: Error(Contract, #3)"));
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/simulation failed/);
        });
        (0, vitest_1.it)("does NOT call sendTransaction when simulateOnly=true", async () => {
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockResolvedValue({ sign: vitest_1.vi.fn() });
            const result = await tool.execute({
                contractId: VALID_CONTRACT,
                method: "release",
                args: [],
                simulateOnly: true,
            });
            (0, vitest_1.expect)(rpcClient.sorobanServer.sendTransaction).not.toHaveBeenCalled();
            (0, vitest_1.expect)(result.simulationResult).toBeDefined();
        });
    });
    // ── Submission and confirmation polling ─────────────────────────────────────
    (0, vitest_1.describe)("Submission and confirmation polling", () => {
        (0, vitest_1.beforeEach)(() => {
            vitest_1.vi.mocked(rpcClient.loadAccount).mockResolvedValue(makeMockAccount("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"));
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockResolvedValue({ sign: vitest_1.vi.fn() });
        });
        (0, vitest_1.it)("returns txHash after a successful confirmation on first poll", async () => {
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "PENDING",
                hash: "confirmed_hash",
            });
            vitest_1.vi.mocked(rpcClient.sorobanServer.getTransaction).mockResolvedValue({
                status: "SUCCESS",
            });
            const result = await tool.execute({
                contractId: VALID_CONTRACT,
                method: "release",
                args: [],
            });
            (0, vitest_1.expect)(result.txHash).toBe("confirmed_hash");
        });
        (0, vitest_1.it)("polls multiple times before SUCCESS", async () => {
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "PENDING",
                hash: "slow_confirm_hash",
            });
            vitest_1.vi.mocked(rpcClient.sorobanServer.getTransaction)
                .mockResolvedValueOnce({ status: "NOT_FOUND" })
                .mockResolvedValueOnce({ status: "NOT_FOUND" })
                .mockResolvedValueOnce({ status: "SUCCESS" });
            const result = await tool.execute({
                contractId: VALID_CONTRACT,
                method: "release",
                args: [],
            });
            (0, vitest_1.expect)(result.txHash).toBe("slow_confirm_hash");
            (0, vitest_1.expect)(rpcClient.sorobanServer.getTransaction).toHaveBeenCalledTimes(3);
        });
        (0, vitest_1.it)("throws when on-chain status is FAILED", async () => {
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "PENDING",
                hash: "failed_on_chain_hash",
            });
            vitest_1.vi.mocked(rpcClient.sorobanServer.getTransaction).mockResolvedValue({
                status: "FAILED",
            });
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/failed on-chain/);
        });
        (0, vitest_1.it)("throws when sendTransaction returns ERROR status", async () => {
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "ERROR",
                errorResult: { toXDR: () => "base64_error_xdr" },
                hash: "error_hash",
            });
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/Soroban submit failed/);
        });
        (0, vitest_1.it)("throws when polling window is exhausted (timeout)", async () => {
            vitest_1.vi.mocked(rpcClient.sorobanServer.sendTransaction).mockResolvedValue({
                status: "PENDING",
                hash: "never_confirms_hash",
            });
            // Always return NOT_FOUND — simulates a stalled transaction
            vitest_1.vi.mocked(rpcClient.sorobanServer.getTransaction).mockResolvedValue({
                status: "NOT_FOUND",
            });
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/not confirmed within polling window/);
        }, 5_000); // RETRY_DELAY_MS=100 → intervalMs=200ms × 10 attempts ≈ 2s
    });
    // ── Network error handling ──────────────────────────────────────────────────
    (0, vitest_1.describe)("Network error handling", () => {
        (0, vitest_1.beforeEach)(() => {
            vitest_1.vi.mocked(rpcClient.loadAccount).mockResolvedValue(makeMockAccount("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"));
        });
        (0, vitest_1.it)("propagates network timeout on prepareSorobanTx", async () => {
            vitest_1.vi.mocked(rpcClient.prepareSorobanTx).mockRejectedValue(new Error("ECONNABORTED: network timeout"));
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/timeout/);
        });
        (0, vitest_1.it)("propagates account load failure", async () => {
            vitest_1.vi.mocked(rpcClient.loadAccount).mockRejectedValue(new Error("Horizon: account not found (404)"));
            await (0, vitest_1.expect)(tool.execute({ contractId: VALID_CONTRACT, method: "release", args: [] })).rejects.toThrow(/not found/);
        });
    });
});
//# sourceMappingURL=soroban_invoke.test.js.map