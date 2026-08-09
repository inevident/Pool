import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createHash } from "node:crypto";
import { assertRateLimit, readLimitedJson, RequestBoundaryError } from "../../../../lib/agent/http";
import { matchCatalogProduct } from "../../../../lib/extension/match";
import { extensionCorsHeaders, extensionPreflightResponse } from "../../../../lib/extension/cors";

export const dynamic = "force-dynamic";

const listingRequestSchema = z
  .object({
    productName: z.string().trim().min(2).max(200),
    url: z.string().trim().max(2_048).optional(),
    sourceSite: z.string().trim().max(120).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export function OPTIONS() {
  return extensionPreflightResponse();
}

export async function POST(request: NextRequest) {
  try {
    assertRateLimit(request, "extension-request", { maxRequests: 15 });
    const payload = listingRequestSchema.parse(await readLimitedJson(request, 4_096));

    // If the shopper is asking for something already on POOL, tell them.
    const existing = matchCatalogProduct({ title: payload.productName, url: payload.url });

    // No durable store in the sandbox: acknowledge with a deterministic id so a
    // repeat submission is recognizably the same request. This is an honest
    // receipt, not a promise that a catalog team has seen it.
    const requestId =
      "req_" +
      createHash("sha256")
        .update(`${payload.productName}|${payload.url ?? ""}`.toLowerCase())
        .digest("hex")
        .slice(0, 16);

    return NextResponse.json(
      {
        status: existing.matched ? "already_listed" : "received",
        requestId,
        alreadyListed: existing.matched,
        existingPool: existing.pool,
        message: existing.matched
          ? "Good news — this product is already forming a pool on POOL."
          : "Request logged in the sandbox. Production POOL would queue it for catalog review.",
        persisted: false,
      },
      { headers: extensionCorsHeaders },
    );
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: error.status, headers: extensionCorsHeaders },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { status: "rejected", code: "INVALID_REQUEST", message: "Include a product name (2–200 characters)." },
        { status: 400, headers: extensionCorsHeaders },
      );
    }
    return NextResponse.json(
      { status: "unavailable", code: "REQUEST_UNAVAILABLE", message: "The listing request could not be recorded." },
      { status: 503, headers: extensionCorsHeaders },
    );
  }
}
