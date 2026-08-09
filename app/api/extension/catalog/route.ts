import { NextResponse } from "next/server";
import { publicCatalog } from "../../../../lib/extension/match";
import { extensionCorsHeaders, extensionPreflightResponse } from "../../../../lib/extension/cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return extensionPreflightResponse();
}

export function GET() {
  // The extension caches this so it can hint even before a match round-trip.
  return NextResponse.json({ products: publicCatalog() }, { headers: extensionCorsHeaders });
}
