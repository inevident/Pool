import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { assertRateLimit, readLimitedJson, RequestBoundaryError } from "../../../../lib/agent/http";
import { matchCatalogProduct } from "../../../../lib/extension/match";
import { extensionCorsHeaders, extensionPreflightResponse } from "../../../../lib/extension/cors";

export const dynamic = "force-dynamic";

const matchRequestSchema = z
  .object({
    title: z.string().trim().max(300).optional(),
    url: z.string().trim().max(2_048).optional(),
  })
  .strict();

export function OPTIONS() {
  return extensionPreflightResponse();
}

export async function POST(request: NextRequest) {
  try {
    assertRateLimit(request, "extension-match", { maxRequests: 60 });
    const payload = matchRequestSchema.parse(await readLimitedJson(request, 4_096));
    const result = matchCatalogProduct(payload);
    return NextResponse.json(result, { headers: extensionCorsHeaders });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { matched: false, code: error.code, message: error.message },
        { status: error.status, headers: extensionCorsHeaders },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { matched: false, code: "INVALID_QUERY", message: "Send a page title and/or url." },
        { status: 400, headers: extensionCorsHeaders },
      );
    }
    return NextResponse.json(
      { matched: false, code: "MATCH_UNAVAILABLE", message: "The catalog matcher is unavailable." },
      { status: 503, headers: extensionCorsHeaders },
    );
  }
}
