"use strict";
/**
 * backend/agent.ts
 *
 * Core PayFi Agent orchestrator.
 *
 * Config usage pattern:
 *   - All network/identity values come from the validated `config` singleton.
 *   - Tools that need the Keypair call `config.agentKeypair()` explicitly —
 *     the secret never lives on the config object itself.
 *   - The spending limit is enforced here before delegating to tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayFiAgent = void 0;
const config_1 = require("./config");
const StellarPaymentTool_1 = require("./tools/StellarPaymentTool");
const SorobanInvokeTool_1 = require("./tools/SorobanInvokeTool");
const X402PaymentTool_1 = require("./tools/X402PaymentTool");
// ─── Spending limit guard ─────────────────────────────────────────────────────
/**
 * Check that a payment amount does not exceed the configured spending limit.
 * Called before delegating to StellarPaymentTool or X402PaymentTool.
 */
function assertWithinSpendingLimit(amount) {
    if (typeof amount !== "string")
        return; // let the tool's own schema catch this
    const parsed = parseFloat(amount);
    const limit = parseFloat(config_1.config.AGENT_SPENDING_LIMIT);
    if (!isNaN(parsed) && parsed > limit) {
        throw new Error(`Payment amount ${amount} ${config_1.config.X402_ASSET_CODE} exceeds ` +
            `AGENT_SPENDING_LIMIT of ${config_1.config.AGENT_SPENDING_LIMIT}`);
    }
}
// ─── Agent ────────────────────────────────────────────────────────────────────
class PayFiAgent {
    paymentTool;
    sorobanTool;
    x402Tool;
    constructor() {
        // Pass Keypair objects directly to tools
        const keypair = config_1.config.agentKeypair();
        this.paymentTool = new StellarPaymentTool_1.StellarPaymentTool(keypair);
        this.sorobanTool = new SorobanInvokeTool_1.SorobanInvokeTool(keypair);
        this.x402Tool = new X402PaymentTool_1.X402PaymentTool(keypair);
        // Log only safe fields — public key is derived, not the secret
        console.log(` PayFiAgent initialised`);
        console.log(`   Network        : ${config_1.config.STELLAR_NETWORK}`);
        console.log(`   Horizon        : ${config_1.config.HORIZON_URL}`);
        console.log(`   Soroban        : ${config_1.config.SOROBAN_RPC_URL}`);
        console.log(`   Agent pubkey   : ${config_1.config.AGENT_PUBLIC_KEY}`);
        console.log(`   Spending limit : ${config_1.config.AGENT_SPENDING_LIMIT} ${config_1.config.X402_ASSET_CODE}`);
    }
    /** Dispatch a task to the correct tool */
    async run(task) {
        console.log(`\n [Agent] Running task: ${task.type}`);
        try {
            let data;
            switch (task.type) {
                case "stellar_payment": {
                    const p = task.payload;
                    assertWithinSpendingLimit(p?.amount);
                    data = await this.paymentTool.execute(task.payload);
                    break;
                }
                case "soroban_invoke":
                    data = await this.sorobanTool.execute(task.payload);
                    break;
                case "x402_respond": {
                    const p = task.payload;
                    assertWithinSpendingLimit(p?.amount);
                    data = await this.x402Tool.respond(task.payload);
                    break;
                }
                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }
            console.log(` [Agent] Task completed: ${task.type}`);
            return { success: true, taskType: task.type, data };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Redact anything that looks like a secret key before logging
            const safe = message.replace(/S[A-Z2-7]{55}/g, "[REDACTED]");
            console.error(` [Agent] Task failed: ${task.type} — ${safe}`);
            return { success: false, taskType: task.type, error: safe };
        }
    }
}
exports.PayFiAgent = PayFiAgent;
//# sourceMappingURL=agent.js.map