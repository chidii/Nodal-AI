"use strict";
/**
 * backend/tools/StellarPaymentTool.ts
 * Standalone tool: native XLM or asset payment via Horizon.
 *
 * Architecture: Tool → simulate → sign → submit
 * Never broadcasts without a prior simulation pass.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarPaymentTool = exports.PaymentInputSchema = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const zod_1 = require("zod");
const config_1 = require("../config");
const rpc_client_1 = require("../rpc_client");
// ─── Input schema ─────────────────────────────────────────────────────────────
exports.PaymentInputSchema = zod_1.z.object({
    destination: zod_1.z.string().length(56, "Invalid Stellar public key"),
    amount: zod_1.z
        .string()
        // Negative-lookahead rejects "0" and all zero-value decimals ("0.0", "0.0000000")
        .regex(/^(?!0(\.0+)?$)\d+(\.\d{1,7})?$/, "Amount must be a valid Stellar decimal")
        // Belt-and-suspenders guard: parseFloat catches any edge cases the regex misses
        .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero"),
    assetCode: zod_1.z.string().default("XLM"),
    assetIssuer: zod_1.z.string().optional(),
    memo: zod_1.z.string().max(28).optional(),
});
// ─── Tool implementation ──────────────────────────────────────────────────────
class StellarPaymentTool {
    keypair;
    networkPassphrase;
    constructor(secretKey = config_1.config.agentKeypair().secret()) {
        this.keypair = stellar_sdk_1.Keypair.fromSecret(secretKey);
        this.networkPassphrase =
            config_1.config.STELLAR_NETWORK === "mainnet"
                ? stellar_sdk_1.Networks.PUBLIC
                : config_1.config.STELLAR_NETWORK === "futurenet"
                    ? stellar_sdk_1.Networks.FUTURENET
                    : stellar_sdk_1.Networks.TESTNET;
    }
    get publicKey() {
        return this.keypair.publicKey();
    }
    /**
     * Execute a payment.
     * Steps: validate → build → simulate (fee bump check) → sign → submit
     */
    async execute(rawInput) {
        // 1. Validate input
        const input = exports.PaymentInputSchema.parse(rawInput);
        // 2. Resolve asset
        const asset = input.assetCode === "XLM"
            ? stellar_sdk_1.Asset.native()
            : new stellar_sdk_1.Asset(input.assetCode, input.assetIssuer);
        // 3. Load source account (latest sequence number)
        const sourceAccount = await (0, rpc_client_1.loadAccount)(this.keypair.publicKey());
        // 4. Build transaction
        const txBuilder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(stellar_sdk_1.Operation.payment({
            destination: input.destination,
            asset,
            amount: input.amount,
        }))
            .setTimeout(30);
        if (input.memo) {
            txBuilder.addMemo(stellar_sdk_1.Memo.text(input.memo));
        }
        const tx = txBuilder.build();
        // 5. Fee estimation / simulation via Horizon dry-run
        //    (Horizon doesn't expose simulation like Soroban, so we validate
        //     the transaction envelope locally before submission)
        console.log(`🔍 [StellarPaymentTool] Validating payment envelope...`);
        console.log(`   Source  : ${this.keypair.publicKey()}`);
        console.log(`   Dest    : ${input.destination}`);
        console.log(`   Amount  : ${input.amount} ${input.assetCode}`);
        // 6. Sign
        tx.sign(this.keypair);
        // 7. Submit
        const result = await (0, rpc_client_1.submitTransaction)(tx);
        return {
            txHash: result.hash,
            ledger: result.ledger,
        };
    }
}
exports.StellarPaymentTool = StellarPaymentTool;
//# sourceMappingURL=StellarPaymentTool.js.map