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

import { Keypair, Networks, hash } from "@stellar/stellar-sdk";
import { z } from "zod";
import { config } from "../config";
import { StellarPaymentTool } from "./StellarPaymentTool";

// ─── x402 schemas ────────────────────────────────────────────────────────────

/** Incoming payment challenge from a resource server */
export const X402ChallengeSchema = z.object({
  resource: z.string().url("Must be a valid resource URL"),
  amount: z.string(),
  assetCode: z.string().default(config.X402_ASSET_CODE),
  assetIssuer: z.string().default(config.X402_ASSET_ISSUER),
  payTo: z.string().length(56, "Invalid payTo Stellar address"),
  nonce: z.string().uuid("Nonce must be a UUID v4"),
  expiresAt: z.string().datetime(),
});

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

// ─── Tool implementation ──────────────────────────────────────────────────────

export class X402PaymentTool {
  private paymentTool: StellarPaymentTool;
  private keypair: Keypair;

  constructor(secretKey: string = config.agentKeypair().secret()) {
    this.keypair = Keypair.fromSecret(secretKey);
    this.paymentTool = new StellarPaymentTool(secretKey);
  }

  /**
   * Respond to an x402 payment challenge.
   * Returns a proof object the resource server can verify on Horizon.
   */
  async respond(rawChallenge: unknown): Promise<X402PaymentProof> {
    // 1. Validate challenge
    const challenge = X402ChallengeSchema.parse(rawChallenge);

    // 2. Reject expired challenges
    if (new Date(challenge.expiresAt) <= new Date()) {
      throw new Error(`x402 challenge expired at ${challenge.expiresAt}`);
    }

    console.log(`💳 [X402PaymentTool] Responding to x402 challenge`);
    console.log(`   Resource : ${challenge.resource}`);
    console.log(`   Amount   : ${challenge.amount} ${challenge.assetCode}`);
    console.log(`   Nonce    : ${challenge.nonce}`);

    // 3. Execute payment using StellarPaymentTool (includes simulation)
    const { txHash } = await this.paymentTool.execute({
      destination: challenge.payTo,
      amount: challenge.amount,
      assetCode: challenge.assetCode,
      assetIssuer:
        challenge.assetCode === "XLM" ? undefined : challenge.assetIssuer,
      memo: challenge.nonce.slice(0, 28), // embed nonce in memo for auditability
    });

    // 4. Build proof
    const proof: X402PaymentProof = {
      protocol: "x402",
      network: config.STELLAR_NETWORK,
      txHash,
      nonce: challenge.nonce,
      payer: this.keypair.publicKey(),
      signedAt: new Date().toISOString(),
    };

    console.log(`✅ [X402PaymentTool] Payment proof issued. txHash: ${txHash}`);
    return proof;
  }
}
