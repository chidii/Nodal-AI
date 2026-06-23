/**
 * backend/tools/X402PaymentTool.ts
 * x402 machine-to-machine PayFi payment tool.
 *
 * The x402 standard wraps a payment claim in a structured envelope
 * that downstream services can verify without trusting the agent.
 *
 * Flow:
 *  1. Agent receives a payment request (x402 challenge)
 *  2. Tool validates the challenge and amount
 *  3. Constructs a signed Stellar payment
 *  4. Returns an x402-compliant payment proof
 */
import { Keypair } from "@stellar/stellar-sdk";
import { z } from "zod";
/** Incoming payment challenge from a resource server */
export declare const X402ChallengeSchema: z.ZodObject<{
    resource: z.ZodString;
    amount: z.ZodString;
    assetCode: z.ZodDefault<z.ZodString>;
    assetIssuer: z.ZodDefault<z.ZodString>;
    payTo: z.ZodString;
    nonce: z.ZodString;
    expiresAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amount: string;
    assetCode: string;
    assetIssuer: string;
    resource: string;
    payTo: string;
    nonce: string;
    expiresAt: string;
}, {
    amount: string;
    resource: string;
    payTo: string;
    nonce: string;
    expiresAt: string;
    assetCode?: string | undefined;
    assetIssuer?: string | undefined;
}>;
export type X402Challenge = z.infer<typeof X402ChallengeSchema>;
/** Payment proof returned to the resource server */
export interface X402PaymentProof {
    protocol: "x402";
    network: string;
    txHash: string;
    nonce: string;
    payer: string;
    signedAt: string;
}
export declare class X402PaymentTool {
    private paymentTool;
    private keypair;
    constructor(keypairOrSecret?: Keypair | string);
    /**
     * Respond to an x402 payment challenge.
     * Returns a proof object the resource server can verify on Horizon.
     */
    respond(rawChallenge: unknown): Promise<X402PaymentProof>;
}
//# sourceMappingURL=X402PaymentTool.d.ts.map