/**
 * backend/config.ts
 *
 * Production-grade, schema-validated configuration layer.
 *
 * Security guarantees:
 *   - AGENT_SECRET_KEY is NEVER included in error messages or logs.
 *   - AGENT_PUBLIC_KEY is derived from the secret key at startup;
 *     only the public key is exposed on the config object.
 *   - Invalid env causes an informative error + process.exit(1)
 *     before any network or tool code runs.
 *
 * Usage:
 *   import { config } from "./config";
 *   config.HORIZON_URL          // validated URL string
 *   config.AGENT_PUBLIC_KEY     // derived G-address, safe to log
 *   config.agentKeypair()       // call-site requests the Keypair explicitly
 */
import { z } from "zod";
import { Keypair } from "@stellar/stellar-sdk";
declare const EnvSchema: z.ZodObject<{
    STELLAR_NETWORK: z.ZodDefault<z.ZodEnum<["testnet", "mainnet", "futurenet"]>>;
    HORIZON_URL: z.ZodString;
    SOROBAN_RPC_URL: z.ZodString;
    AGENT_SECRET_KEY: z.ZodEffects<z.ZodString, string, string>;
    AGENT_PUBLIC_KEY: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    X402_ASSET_CODE: z.ZodDefault<z.ZodString>;
    X402_ASSET_ISSUER: z.ZodString;
    AGENT_SPENDING_LIMIT: z.ZodDefault<z.ZodString>;
    MAX_RETRIES: z.ZodDefault<z.ZodNumber>;
    RETRY_DELAY_MS: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    STELLAR_NETWORK: "testnet" | "mainnet" | "futurenet";
    HORIZON_URL: string;
    SOROBAN_RPC_URL: string;
    AGENT_SECRET_KEY: string;
    X402_ASSET_CODE: string;
    X402_ASSET_ISSUER: string;
    AGENT_SPENDING_LIMIT: string;
    MAX_RETRIES: number;
    RETRY_DELAY_MS: number;
    AGENT_PUBLIC_KEY?: string | undefined;
}, {
    HORIZON_URL: string;
    SOROBAN_RPC_URL: string;
    AGENT_SECRET_KEY: string;
    X402_ASSET_ISSUER: string;
    STELLAR_NETWORK?: "testnet" | "mainnet" | "futurenet" | undefined;
    AGENT_PUBLIC_KEY?: string | undefined;
    X402_ASSET_CODE?: string | undefined;
    AGENT_SPENDING_LIMIT?: string | undefined;
    MAX_RETRIES?: number | undefined;
    RETRY_DELAY_MS?: number | undefined;
}>;
type RawEnv = z.infer<typeof EnvSchema>;
export interface AgentConfig extends Omit<RawEnv, "AGENT_SECRET_KEY" | "AGENT_PUBLIC_KEY"> {
    /** Derived G-address — safe to log */
    readonly AGENT_PUBLIC_KEY: string;
    /**
     * Returns the agent Keypair on demand.
     * Deliberately a function so callers are explicit about accessing the secret.
     * The secret key is held in closure and never placed on the config object.
     */
    readonly agentKeypair: () => Keypair;
}
export declare const config: AgentConfig;
export declare const MAINNET_SPENDING_CAP = 10000;
export {};
//# sourceMappingURL=config.d.ts.map