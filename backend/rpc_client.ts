/**
 * backend/rpc_client.ts
 * Thin wrapper around Horizon + Soroban RPC with retry logic.
 * All network calls route through here — centralised observability point.
 */

import {
  Horizon,
  SorobanRpc,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import { config } from "./config";
import { validateXDR } from "./types/xdr";

// ─── Timeout error ────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Transaction Timeout: request did not complete within ${ms}ms`);
    this.name = "TimeoutError";
  }
}

const SUBMIT_TIMEOUT_MS = 30_000;

// ─── Exponential back-off retry ─────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = config.MAX_RETRIES,
  delayMs = config.RETRY_DELAY_MS
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️  Attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt)); // exponential back-off
      }
    }
  }
  throw lastErr;
}

// ─── Horizon client ──────────────────────────────────────────────────────────

export const horizonServer = new Horizon.Server(config.HORIZON_URL, {
  allowHttp: config.STELLAR_NETWORK !== "mainnet",
});

export async function loadAccount(publicKey: string) {
  return withRetry(() => horizonServer.loadAccount(publicKey));
}

export async function submitTransaction(tx: Transaction | FeeBumpTransaction) {
  // Guard: validate XDR encoding before initiating any network call
  validateXDR(tx.toEnvelope().toXDR("base64"));

  return withRetry(() => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(SUBMIT_TIMEOUT_MS));
      }, SUBMIT_TIMEOUT_MS);
    });

    return Promise.race([
      horizonServer.submitTransaction(tx),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));
  });
}

// ─── Soroban RPC client ───────────────────────────────────────────────────────

export const sorobanServer = new SorobanRpc.Server(config.SOROBAN_RPC_URL, {
  allowHttp: config.STELLAR_NETWORK !== "mainnet",
});

/**
 * Simulate a Soroban transaction BEFORE broadcasting.
 * Returns the simulation result — callers MUST check for errors.
 */
export async function simulateSorobanTx(tx: Transaction) {
  return withRetry(() => sorobanServer.simulateTransaction(tx));
}

/**
 * Prepare (simulate + assemble) a Soroban transaction.
 * Throws if simulation indicates failure — safe guard before broadcast.
 */
export async function prepareSorobanTx(tx: Transaction): Promise<Transaction> {
  const simResult = await simulateSorobanTx(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  return SorobanRpc.assembleTransaction(tx, simResult).build();
}
