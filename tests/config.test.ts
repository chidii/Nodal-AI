import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { z } from "zod";

vi.mock("child_process", async () => {
  const original = await vi.importActual<any>("child_process");
  return {
    ...original,
    execSync: vi.fn(),
  };
});

describe("config.ts startup validation", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: any;
  let stderrSpy: any;
  let stdoutSpy: any;

  beforeEach(() => {
    vi.resetModules();
    originalEnv = { ...process.env };
    
    // Setup process spies
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit: ${code}`);
    });
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails if both AGENT_SECRET_KEY and AGENT_SECRET_KEY_ARN are set", async () => {
    process.env.AGENT_SECRET_KEY = "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73";
    process.env.AGENT_SECRET_KEY_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret";

    await expect(async () => {
      await import("../backend/config");
    }).rejects.toThrow("process.exit: 1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot specify both AGENT_SECRET_KEY and AGENT_SECRET_KEY_ARN")
    );
  });

  it("fetches the secret using Secrets Manager command when AGENT_SECRET_KEY_ARN is set", async () => {
    const validSecret = "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73";
    
    // Set minimal environment for EnvSchema to pass
    process.env.HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.X402_ASSET_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    delete process.env.AGENT_SECRET_KEY;
    process.env.AGENT_SECRET_KEY_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret";

    // Mock execSync to return the secret key
    vi.mocked(execSync).mockReturnValue(Buffer.from(validSecret));

    const { config } = await import("../backend/config");

    expect(execSync).toHaveBeenCalled();
    expect(config.AGENT_PUBLIC_KEY).toBe("GDRIFTCEWUMA5IM6NUQPLA27YPHDMUNMPDXCQWCD3BRPVKMPX5KEM5F5");
    expect(config.agentKeypair().secret()).toBe(validSecret);
  });

  it("supports JSON structured Secrets Manager response", async () => {
    const validSecret = "SBZ7EYXHNB4WPPIWC5YAMH2U4L4QU6DKYXQWG4I55G6O4CLE4BBHCE73";
    const jsonSecret = JSON.stringify({ AGENT_SECRET_KEY: validSecret });

    process.env.HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.X402_ASSET_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    delete process.env.AGENT_SECRET_KEY;
    process.env.AGENT_SECRET_KEY_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret";

    vi.mocked(execSync).mockReturnValue(Buffer.from(jsonSecret));

    const { config } = await import("../backend/config");

    expect(config.agentKeypair().secret()).toBe(validSecret);
  });

  it("fails validation if fetched secret is not a valid Stellar key", async () => {
    process.env.HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.X402_ASSET_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    delete process.env.AGENT_SECRET_KEY;
    process.env.AGENT_SECRET_KEY_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret";

    vi.mocked(execSync).mockReturnValue(Buffer.from("invalid-secret"));

    await expect(async () => {
      await import("../backend/config");
    }).rejects.toThrow("process.exit: 1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("AGENT_SECRET_KEY is not a valid Stellar secret key")
    );
  });
});

describe("SpendingLimitSchema", () => {
  const SpendingLimitSchema = z
    .string()
    .regex(
      /^[1-9]\d*(\.\d{1,7})?$/,
      "AGENT_SPENDING_LIMIT must be a positive decimal (e.g. '100' or '50.0000000')"
    )
    .default("100");

  describe("accepted values", () => {
    it("accepts single digit positive integer", () => {
      const result = SpendingLimitSchema.safeParse("1");
      expect(result.success).toBe(true);
      expect(result.data).toBe("1");
    });

    it("accepts large integer", () => {
      const result = SpendingLimitSchema.safeParse("9999999");
      expect(result.success).toBe(true);
    });

    it("accepts decimal with 1 decimal place", () => {
      const result = SpendingLimitSchema.safeParse("100.5");
      expect(result.success).toBe(true);
    });

    it("accepts 7 decimal places (boundary)", () => {
      const result = SpendingLimitSchema.safeParse("9999999.9999999");
      expect(result.success).toBe(true);
    });

    it("accepts max decimal precision at single digit", () => {
      const result = SpendingLimitSchema.safeParse("1.0000001");
      expect(result.success).toBe(true);
    });

    it("defaults to '100' when undefined", () => {
      const result = SpendingLimitSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe("100");
    });
  });

  describe("rejected values", () => {
    it("rejects zero", () => {
      const result = SpendingLimitSchema.safeParse("0");
      expect(result.success).toBe(false);
    });

    it("rejects negative number", () => {
      const result = SpendingLimitSchema.safeParse("-1");
      expect(result.success).toBe(false);
    });

    it("rejects 8 decimal places", () => {
      const result = SpendingLimitSchema.safeParse("0.00000001");
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric string", () => {
      const result = SpendingLimitSchema.safeParse("abc");
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = SpendingLimitSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });
});
