"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402PaymentTool = exports.X402ChallengeSchema = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const zod_1 = require("zod");
const config_1 = require("../config");
const StellarPaymentTool_1 = require("./StellarPaymentTool");
// ─── x402 schemas ────────────────────────────────────────────────────────────
/** Incoming payment challenge from a resource server */
exports.X402ChallengeSchema = zod_1.z.object({
    resource: zod_1.z.string().url("Must be a valid resource URL"),
    amount: zod_1.z.string(),
    assetCode: zod_1.z.string().default(config_1.config.X402_ASSET_CODE),
    assetIssuer: zod_1.z.string().default(config_1.config.X402_ASSET_ISSUER),
    payTo: zod_1.z.string().length(56, "Invalid payTo Stellar address"),
    nonce: zod_1.z.string().uuid("Nonce must be a UUID v4"),
    expiresAt: zod_1.z.string().datetime(),
});
// ─── Tool implementation ──────────────────────────────────────────────────────
class X402PaymentTool {
    paymentTool;
    keypair;
    constructor(keypairOrSecret) {
        if (keypairOrSecret instanceof stellar_sdk_1.Keypair) {
            this.keypair = keypairOrSecret;
        }
        else if (typeof keypairOrSecret === 'string') {
            this.keypair = stellar_sdk_1.Keypair.fromSecret(keypairOrSecret);
        }
        else {
            this.keypair = config_1.config.agentKeypair();
        }
        this.paymentTool = new StellarPaymentTool_1.StellarPaymentTool(this.keypair);
    }
    /**
     * Respond to an x402 payment challenge.
     * Returns a proof object the resource server can verify on Horizon.
     */
    async respond(rawChallenge) {
        // 1. Validate challenge
        const challenge = exports.X402ChallengeSchema.parse(rawChallenge);
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
            assetIssuer: challenge.assetCode === "XLM" ? undefined : challenge.assetIssuer,
            memo: challenge.nonce.slice(0, 28), // embed nonce in memo for auditability
        });
        // 4. Build proof
        const proof = {
            protocol: "x402",
            network: config_1.config.STELLAR_NETWORK,
            txHash,
            nonce: challenge.nonce,
            payer: this.keypair.publicKey(),
            signedAt: new Date().toISOString(),
        };
        console.log(`✅ [X402PaymentTool] Payment proof issued. txHash: ${txHash}`);
        return proof;
    }
}
exports.X402PaymentTool = X402PaymentTool;
//# sourceMappingURL=X402PaymentTool.js.map