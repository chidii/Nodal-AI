/**
 * backend/rpc_client.ts
 * Thin wrapper around Horizon + Soroban RPC with retry logic.
 * All network calls route through here — centralised observability point.
 */
import { Horizon, rpc, Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";
export declare const horizonServer: Horizon.Server;
export declare function loadAccount(publicKey: string): Promise<Horizon.AccountResponse>;
export declare function submitTransaction(tx: Transaction | FeeBumpTransaction): Promise<Horizon.HorizonApi.SubmitTransactionResponse>;
export declare const sorobanServer: rpc.Server;
/**
 * Simulate a Soroban transaction BEFORE broadcasting.
 * Returns the simulation result — callers MUST check for errors.
 */
export declare function simulateSorobanTx(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
/**
 * Prepare (simulate + assemble) a Soroban transaction.
 * Throws if simulation indicates failure — safe guard before broadcast.
 */
export declare function prepareSorobanTx(tx: Transaction): Promise<Transaction>;
//# sourceMappingURL=rpc_client.d.ts.map