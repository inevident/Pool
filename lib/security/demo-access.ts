import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const DEMO_ACCESS_COOKIE = "pool_demo_access";
export const DEMO_ACCESS_TTL_SECONDS = 4 * 60 * 60;
export const DEMO_ACCESS_MIN_LENGTH = 24;

const tokenDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();

const configuredToken = () => process.env.POOL_DEMO_ACCESS_TOKEN?.trim() ?? "";

const sessionSignature = (expiresAtSeconds: number, token: string) =>
  createHmac("sha256", token)
    .update(`pool-demo-access:v1:${expiresAtSeconds}`, "utf8")
    .digest("hex");

export function isLoopbackRequest(request: NextRequest) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function isDemoAccessConfigured() {
  return configuredToken().length >= DEMO_ACCESS_MIN_LENGTH;
}

export function getDemoAccessConfiguration() {
  const length = configuredToken().length;
  const present = length > 0;
  const valid = length >= DEMO_ACCESS_MIN_LENGTH;
  const required =
    (process.env.NODE_ENV === "production" &&
      process.env.RAIN_LIVE_EXECUTION_ENABLED === "true") ||
    process.env.MONAD_LIVE_REQUIRED?.trim() === "true";
  return {
    present,
    valid,
    required,
    ready: valid || !required,
    state: valid
      ? ("ready" as const)
      : present
        ? ("invalid" as const)
        : required
          ? ("missing" as const)
          : ("not-configured" as const),
  };
}

export function accessCodeMatches(candidate: string) {
  const expected = configuredToken();
  if (expected.length < DEMO_ACCESS_MIN_LENGTH) return false;
  return timingSafeEqual(tokenDigest(candidate), tokenDigest(expected));
}

export function createDemoSession(now = Date.now()) {
  const token = configuredToken();
  if (token.length < DEMO_ACCESS_MIN_LENGTH) return null;
  const expiresAtSeconds = Math.floor(now / 1_000) + DEMO_ACCESS_TTL_SECONDS;
  return {
    value: `${expiresAtSeconds}.${sessionSignature(expiresAtSeconds, token)}`,
    expiresAtSeconds,
  };
}

export function hasValidDemoSession(request: NextRequest, now = Date.now()) {
  const token = configuredToken();
  if (token.length < DEMO_ACCESS_MIN_LENGTH) return false;
  const raw = request.cookies.get(DEMO_ACCESS_COOKIE)?.value ?? "";
  const [expiresRaw, candidateSignature, ...extra] = raw.split(".");
  if (extra.length > 0 || !expiresRaw || !candidateSignature) return false;
  const expiresAtSeconds = Number(expiresRaw);
  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= Math.floor(now / 1_000) ||
    expiresAtSeconds > Math.floor(now / 1_000) + DEMO_ACCESS_TTL_SECONDS
  ) {
    return false;
  }
  const expected = sessionSignature(expiresAtSeconds, token);
  return timingSafeEqual(tokenDigest(candidateSignature), tokenDigest(expected));
}

/**
 * Local development remains frictionless only when no access token was
 * supplied. Production always fails closed unless a valid server-configured
 * token minted the HttpOnly cookie, even if a proxy presents a loopback URL.
 */
export function canExecuteLiveDemo(request: NextRequest) {
  if (hasValidDemoSession(request)) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    isLoopbackRequest(request) &&
    configuredToken().length === 0
  );
}
