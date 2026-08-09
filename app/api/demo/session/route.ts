import { NextRequest, NextResponse } from "next/server.js";
import { z } from "zod";
import {
  accessCodeMatches,
  createDemoSession,
  DEMO_ACCESS_COOKIE,
  DEMO_ACCESS_TTL_SECONDS,
  isDemoAccessConfigured,
} from "../../../../lib/security/demo-access.ts";
import {
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http.ts";

export const dynamic = "force-dynamic";

const inputSchema = z
  .object({ accessCode: z.string().min(1).max(256) })
  .strict();

const attempts = new Map<string, { count: number; resetAt: number }>();

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isRateLimited(request: NextRequest, now = Date.now()) {
  const key =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  if (attempts.size > 1_000) attempts.clear();
  return current.count > 5;
}

export async function POST(request: NextRequest) {
  if (!isDemoAccessConfigured()) {
    return NextResponse.json(
      { status: "disabled", message: "Demo access is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { status: "rejected", message: "Invalid session request." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json(
      { status: "rejected", message: "Invalid session request." },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isRateLimited(request)) {
    return NextResponse.json(
      { status: "rate_limited", message: "Too many access attempts." },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  }

  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await readLimitedJson(request, 1_024));
  } catch (error) {
    const status = error instanceof RequestBoundaryError ? error.status : 400;
    return NextResponse.json(
      { status: "rejected", message: "Invalid session request." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!accessCodeMatches(input.accessCode)) {
    return NextResponse.json(
      { status: "rejected", message: "Access code was not accepted." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = createDemoSession();
  if (!session) {
    return NextResponse.json(
      { status: "disabled", message: "Demo access is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { status: "authorized", expiresAt: new Date(session.expiresAtSeconds * 1_000).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(DEMO_ACCESS_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: DEMO_ACCESS_TTL_SECONDS,
  });
  return response;
}
