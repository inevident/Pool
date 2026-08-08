import "server-only";
import { z } from "zod";

const SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;

const scopedCardSchema = z.object({
  id: z.string().uuid(),
  last4: z.string(),
  expirationMonth: z.union([z.string(), z.number()]),
  expirationYear: z.union([z.string(), z.number()]),
  status: z.enum(["notActivated", "active", "locked", "canceled"]),
});

const simulatedTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  status: z.enum(["authorized", "declined", "settled"]),
  declinedReason: z.string().optional(),
  // The beta sandbox currently returns lowercase values despite the published
  // OpenAPI enum using uppercase values. Accept both documented wire variants.
  completionReason: z
    .enum(["SETTLEMENT", "REFUND", "settlement", "refund"])
    .optional(),
});

export type RainScopedCard = z.infer<typeof scopedCardSchema>;
export type RainSimulatedTransaction = z.infer<
  typeof simulatedTransactionSchema
>;

interface RainConfig {
  apiBaseUrl: string;
  apiKey: string;
  teamId: string;
  userId: string;
  contractId: string;
}

interface RainRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  sessionId?: string;
}

export class RainApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RainApiError";
  }
}

function getRainConfig(): RainConfig {
  const values = {
    apiBaseUrl: process.env.RAIN_API_BASE_URL,
    apiKey: process.env.RAIN_API_KEY,
    teamId: process.env.RAIN_TEAM_ID,
    userId: process.env.RAIN_USER_ID,
    contractId: process.env.RAIN_CONTRACT_ID,
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new RainApiError(
      `Rain sandbox is not configured (${missing.join(", ")})`,
      503,
      "rain_not_configured",
    );
  }

  return values as RainConfig;
}

export function isRainConfigured() {
  return Boolean(
    process.env.RAIN_API_BASE_URL &&
      process.env.RAIN_API_KEY &&
      process.env.RAIN_TEAM_ID &&
      process.env.RAIN_USER_ID &&
      process.env.RAIN_CONTRACT_ID,
  );
}

function safeError(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = [record.message, record.msg, record.error].find(
      (value): value is string => typeof value === "string",
    );
    const code = typeof record.code === "string" ? record.code : undefined;
    return new RainApiError(
      message ?? `Rain request failed with status ${status}`,
      status,
      code,
    );
  }

  return new RainApiError(`Rain request failed with status ${status}`, status);
}

async function pause(durationMs: number) {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function rainRequest(
  path: string,
  options: RainRequestOptions = {},
): Promise<{ body: unknown; idempotencyCached: boolean }> {
  const config = getRainConfig();
  const method = options.method ?? "GET";
  const retryable = method === "GET" || Boolean(options.idempotencyKey);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        method,
        headers: {
          "Api-Key": config.apiKey,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
          ...(options.sessionId ? { sessionid: options.sessionId } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Some successful Rain endpoints return no JSON body.
      }

      if (!response.ok) {
        if (
          retryable &&
          attempt < 2 &&
          (response.status === 429 || response.status >= 500)
        ) {
          await pause(250 * 2 ** attempt);
          continue;
        }
        throw safeError(body, response.status);
      }

      return {
        body,
        idempotencyCached:
          response.headers.get("Idempotency-Cached") === "true",
      };
    } catch (error) {
      if (
        retryable &&
        attempt < 2 &&
        !(error instanceof RainApiError)
      ) {
        await pause(250 * 2 ** attempt);
        continue;
      }
      if (error instanceof RainApiError) throw error;
      throw new RainApiError(
        error instanceof Error ? error.message : "Rain request failed",
        502,
        "rain_network_error",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new RainApiError("Rain request exhausted its retries", 502);
}

function pemBytes(pem: string) {
  const encoded = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function createEncryptedSessionId() {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemBytes(SANDBOX_PUBLIC_KEY),
    { name: "RSA-OAEP", hash: "SHA-1" },
    false,
    ["encrypt"],
  );
  const sessionSecret = crypto.getRandomValues(new Uint8Array(16));
  const plaintext = new TextEncoder().encode(bytesToBase64(sessionSecret));
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    plaintext,
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function verifyRainConnection() {
  const config = getRainConfig();
  const result = await rainRequest(
    `/issuing/transactions?limit=1&teamId=${encodeURIComponent(config.teamId)}`,
  );
  if (!Array.isArray(result.body)) {
    throw new RainApiError("Rain returned an unexpected status response", 502);
  }
  return { connected: true as const, environment: "sandbox" as const };
}

export async function fundDemoCollateral(
  amountInCents: number,
  idempotencyKey: string,
) {
  const config = getRainConfig();
  const result = await rainRequest("/simulate/collateral/fund", {
    method: "POST",
    idempotencyKey,
    body: {
      contractId: config.contractId,
      currency: "rusd",
      amount: amountInCents,
    },
  });
  return { accepted: true as const, cached: result.idempotencyCached };
}

export async function issueScopedCard(input: {
  amountInUSDCents: number;
  allowedMccs: string[];
  expiresAt: string;
  idempotencyKey: string;
}) {
  const config = getRainConfig();
  const sessionId = await createEncryptedSessionId();
  const result = await rainRequest(
    `/issuing/users/${encodeURIComponent(config.userId)}/cards/scoped`,
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      sessionId,
      body: {
        amountInUSDCents: input.amountInUSDCents,
        allowedMccs: input.allowedMccs,
        expiresAt: input.expiresAt,
      },
    },
  );
  return {
    card: scopedCardSchema.parse(result.body),
    cached: result.idempotencyCached,
  };
}

export async function authorizeCard(input: {
  cardId: string;
  amountInCents: number;
  merchantName: string;
  merchantCategoryCode: string;
  idempotencyKey: string;
}) {
  const result = await rainRequest("/simulate/transactions/authorize", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      cardId: input.cardId,
      amount: input.amountInCents,
      currency: "USD",
      merchantName: input.merchantName,
      merchantCategoryCode: input.merchantCategoryCode,
    },
  });
  return {
    transaction: simulatedTransactionSchema.parse(result.body),
    cached: result.idempotencyCached,
  };
}

export async function settleAuthorization(input: {
  transactionId: string;
  amountInCents: number;
  idempotencyKey: string;
}) {
  const result = await rainRequest(
    `/simulate/transactions/${encodeURIComponent(input.transactionId)}/settle`,
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: { amount: input.amountInCents },
    },
  );
  return {
    transaction: simulatedTransactionSchema.parse(result.body),
    cached: result.idempotencyCached,
  };
}

export async function reverseAuthorization(input: {
  transactionId: string;
  idempotencyKey: string;
}) {
  const result = await rainRequest(
    `/simulate/transactions/${encodeURIComponent(input.transactionId)}/reverse`,
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {},
    },
  );
  return {
    transaction: simulatedTransactionSchema.parse(result.body),
    cached: result.idempotencyCached,
  };
}
