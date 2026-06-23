"use strict";
/**
 * backend/rpc_client.ts
 * Thin wrapper around Horizon + Soroban RPC with retry logic.
 * All network calls route through here — centralised observability point.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sorobanServer = exports.horizonServer = void 0;
exports.loadAccount = loadAccount;
exports.submitTransaction = submitTransaction;
exports.simulateSorobanTx = simulateSorobanTx;
exports.prepareSorobanTx = prepareSorobanTx;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const config_1 = require("./config");
// ─── Exponential back-off retry ─────────────────────────────────────────────
async function withRetry(fn, retries = config_1.config.MAX_RETRIES, delayMs = config_1.config.RETRY_DELAY_MS) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            console.warn(`  Attempt ${attempt}/${retries} failed:`, err.message);
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, delayMs * attempt)); // exponential back-off
            }
        }
    }
    throw lastErr;
}
// ─── Horizon client ──────────────────────────────────────────────────────────
exports.horizonServer = new stellar_sdk_1.Horizon.Server(config_1.config.HORIZON_URL, {
    allowHttp: config_1.config.STELLAR_NETWORK !== "mainnet",
});
async function loadAccount(publicKey) {
    return withRetry(() => exports.horizonServer.loadAccount(publicKey));
}
async function submitTransaction(tx) {
    return withRetry(() => exports.horizonServer.submitTransaction(tx));
}
// ─── Soroban RPC client ───────────────────────────────────────────────────────
exports.sorobanServer = new stellar_sdk_1.rpc.Server(config_1.config.SOROBAN_RPC_URL, {
    allowHttp: config_1.config.STELLAR_NETWORK !== "mainnet",
});
/**
 * Simulate a Soroban transaction BEFORE broadcasting.
 * Returns the simulation result — callers MUST check for errors.
 */
async function simulateSorobanTx(tx) {
    return withRetry(() => exports.sorobanServer.simulateTransaction(tx));
}
/**
 * Prepare (simulate + assemble) a Soroban transaction.
 * Throws if simulation indicates failure — safe guard before broadcast.
 */
async function prepareSorobanTx(tx) {
    const simResult = await simulateSorobanTx(tx);
    if (stellar_sdk_1.rpc.Api.isSimulationError(simResult)) {
        throw new Error(`Soroban simulation failed: ${simResult.error}`);
    }
    return stellar_sdk_1.rpc.assembleTransaction(tx, simResult).build();
}
//# sourceMappingURL=rpc_client.js.map