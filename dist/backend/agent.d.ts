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
export declare class PayFiAgent {
    private paymentTool;
    private sorobanTool;
    private x402Tool;
    constructor();
    /** Dispatch a task to the correct tool */
    run(task: AgentTask): Promise<AgentResult>;
}
//# sourceMappingURL=agent.d.ts.map