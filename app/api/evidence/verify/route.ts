import { NextResponse } from "next/server";

import { assertRateLimit, RequestBoundaryError } from "@/lib/agent/http";
import {
  createUnavailableEvidenceVerification,
  verifyBundledEvidence,
} from "@/lib/evidence/verifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Public, observational verification only. The implementation has no signer,
 * private key, Rain client, or transaction-sending capability.
 */
export async function GET(request: Request) {
  try {
    assertRateLimit(request, "evidence-verify", { maxRequests: 6 });
    return NextResponse.json(await verifyBundledEvidence(), { headers });
  } catch (error) {
    if (error instanceof RequestBoundaryError && error.status === 429) {
      return NextResponse.json(
        createUnavailableEvidenceVerification(
          "RATE_LIMITED",
          "Too many verification requests. Wait a minute and try again.",
          true,
        ),
        {
          status: 429,
          headers: { ...headers, "Retry-After": "60" },
        },
      );
    }

    return NextResponse.json(
      createUnavailableEvidenceVerification(
        "EVIDENCE_VERIFICATION_UNAVAILABLE",
        "The bundled evidence artifact could not be verified. No external write or financial authorization was attempted.",
        false,
      ),
      // Provider and artifact failures are expressed in-band so this
      // observational route remains machine-readable without weakening truth.
      { status: 200, headers },
    );
  }
}
