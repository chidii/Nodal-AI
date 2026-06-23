/**
 * backend/tools/StellarPaymentTool.ts
 * Standalone tool: native XLM or asset payment via Horizon.
 *
 * Architecture: Tool → simulate → sign → submit
 * Never broadcasts without a prior simulation pass.
 */
import { z } from "zod";
export declare const PaymentInputSchema: z.ZodObject<{
    destination: z.ZodString;
    amount: z.ZodEffects<z.ZodString, string, string>;
    assetCode: z.ZodDefault<z.ZodString>;
    assetIssuer: z.ZodOptional<z.ZodString>;
    memo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    destination: string;
    amount: string;
    assetCode: string;
    assetIssuer?: string | undefined;
    memo?: string | undefined;
}, {
    destination: string;
    amount: string;
    assetCode?: string | undefined;
    assetIssuer?: string | undefined;
    memo?: string | undefined;
}>;
export type PaymentInput = z.infer<typeof PaymentInputSchema>;
export declare class StellarPaymentTool {
    private keypair;
    private networkPassphrase;
    constructor(secretKey?: string);
    get publicKey(): string;
    /**
     * Execute a payment.
     * Steps: validate → build → simulate (fee bump check) → sign → submit
     */
    execute(rawInput: unknown): Promise<{
        txHash: string;
        ledger: number;
    }>;
}
//# sourceMappingURL=StellarPaymentTool.d.ts.map