/**
 * backend/tools/BalanceCheckTool.ts
 * Standalone tool: query asset balances for a Stellar account via Horizon.
 *
 * Architecture: validate input → loadAccount (with retry) → filter + return balances
 */

import { z } from "zod";
import { loadAccount } from "../rpc_client";
import { createLogger } from "../utils/logger";

const log = createLogger("balance-check");

// ─── Input schema ─────────────────────────────────────────────────────────────

export const BalanceCheckInputSchema = z.object({
  publicKey: z.string().length(56, "Invalid Stellar public key"),
  assetCode: z.string().min(1).max(12).optional(),
  assetIssuer: z.string().length(56, "Invalid asset issuer address").optional(),
});

export type BalanceCheckInput = z.infer<typeof BalanceCheckInputSchema>;

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface BalanceLine {
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
}

export interface BalanceResult {
  publicKey: string;
  balances: BalanceLine[];
}

// ─── Tool implementation ──────────────────────────────────────────────────────

export class BalanceCheckTool {
  /**
   * Fetch balances for a Stellar account.
   * Optionally filter by assetCode (and assetIssuer for non-XLM assets).
   */
  async getBalance(rawInput: unknown): Promise<BalanceResult> {
    const input = BalanceCheckInputSchema.parse(rawInput);

    log.info({ msg: "Fetching account balances", publicKey: input.publicKey });

    const account = await loadAccount(input.publicKey);

    let balances: BalanceLine[] = account.balances.map((b: any) => ({
      assetType: b.asset_type,
      assetCode: b.asset_type !== "native" ? b.asset_code : undefined,
      assetIssuer: b.asset_type !== "native" ? b.asset_issuer : undefined,
      balance: b.balance,
    }));

    if (input.assetCode) {
      balances = balances.filter((b) =>
        input.assetCode === "XLM"
          ? b.assetType === "native"
          : b.assetCode === input.assetCode &&
            (!input.assetIssuer || b.assetIssuer === input.assetIssuer)
      );
    }

    log.info({ msg: "Balance check complete", publicKey: input.publicKey, count: balances.length });

    return { publicKey: input.publicKey, balances };
  }
}
