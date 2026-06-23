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

import { config, MAINNET_SPENDING_CAP } from "./config";
import { StellarPaymentTool } from "./tools/StellarPaymentTool";
import { SorobanInvokeTool } from "./tools/SorobanInvokeTool";
import { X402PaymentTool } from "./tools/X402PaymentTool";

// ─── Task types ───────────────────────────────────────────────────────────────

export type TaskType = "stellar_payment" | "soroban_invoke" | "x402_respond";

export interface AgentTask {
  type: TaskType;
  payload: unknown;
}

export interface AgentResult {
  success: boolean;
  taskType: TaskType;
  data?: unknown;
  error?: string;
}

// ─── Spending limit guard ─────────────────────────────────────────────────────

/**
 * Check that a payment amount does not exceed the configured spending limit.
 * Called before delegating to StellarPaymentTool or X402PaymentTool.
 */
function assertWithinSpendingLimit(amount: unknown): void {
  if (typeof amount !== "string") return; // let the tool's own schema catch this
  const parsed = parseFloat(amount);
  const limit  = parseFloat(config.AGENT_SPENDING_LIMIT);
  if (!isNaN(parsed) && parsed > limit) {
    throw new Error(
      `Payment amount ${amount} ${config.X402_ASSET_CODE} exceeds ` +
      `AGENT_SPENDING_LIMIT of ${config.AGENT_SPENDING_LIMIT}`
    );
  }
  if (!isNaN(parsed) && config.STELLAR_NETWORK === "mainnet" && parsed > MAINNET_SPENDING_CAP) {
    throw new Error(
      `Payment amount ${amount} ${config.X402_ASSET_CODE} exceeds ` +
      `mainnet spending cap of ${MAINNET_SPENDING_CAP}`
    );
  }
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class PayFiAgent {
  private paymentTool: StellarPaymentTool;
  private sorobanTool: SorobanInvokeTool;
  private x402Tool: X402PaymentTool;

  constructor() {
    // Pass the secret via agentKeypair() — tools call this internally
    this.paymentTool = new StellarPaymentTool(config.agentKeypair().secret());
    this.sorobanTool = new SorobanInvokeTool(config.agentKeypair().secret());
    this.x402Tool    = new X402PaymentTool(config.agentKeypair().secret());

    // Log only safe fields — public key is derived, not the secret
    console.log(`🤖 PayFiAgent initialised`);
    console.log(`   Network        : ${config.STELLAR_NETWORK}`);
    console.log(`   Horizon        : ${config.HORIZON_URL}`);
    console.log(`   Soroban        : ${config.SOROBAN_RPC_URL}`);
    console.log(`   Agent pubkey   : ${config.AGENT_PUBLIC_KEY}`);
    console.log(`   Spending limit : ${config.AGENT_SPENDING_LIMIT} ${config.X402_ASSET_CODE}`);
  }

  /** Dispatch a task to the correct tool */
  async run(task: AgentTask): Promise<AgentResult> {
    console.log(`\n🚀 [Agent] Running task: ${task.type}`);
    try {
      let data: unknown;

      switch (task.type) {
        case "stellar_payment": {
          const p = task.payload as Record<string, unknown>;
          assertWithinSpendingLimit(p?.amount);
          data = await this.paymentTool.execute(task.payload);
          break;
        }

        case "soroban_invoke":
          data = await this.sorobanTool.execute(task.payload);
          break;

        case "x402_respond": {
          const p = task.payload as Record<string, unknown>;
          assertWithinSpendingLimit(p?.amount);
          data = await this.x402Tool.respond(task.payload);
          break;
        }

        default:
          throw new Error(`Unknown task type: ${(task as AgentTask).type}`);
      }

      console.log(`✅ [Agent] Task completed: ${task.type}`);
      return { success: true, taskType: task.type, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Redact anything that looks like a secret key before logging
      const safe = message.replace(/S[A-Z2-7]{55}/g, "[REDACTED]");
      console.error(`❌ [Agent] Task failed: ${task.type} — ${safe}`);
      return { success: false, taskType: task.type, error: safe };
    }
  }
}
