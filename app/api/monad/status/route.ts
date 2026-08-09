import { NextResponse } from "next/server";

import { getMonadStatus } from "@/lib/monad/status";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    return NextResponse.json(await getMonadStatus(), { headers });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "MONAD_STATUS_UNAVAILABLE";
    return NextResponse.json(
      {
        readiness: "degraded",
        mode: "unavailable",
        state: "proof-unavailable",
        confirmation: "not-confirmed",
        network: {
          name: "Monad Testnet",
          chainId: 10_143,
          testnet: true,
        },
        code,
        message: "Monad proof could not be verified from finalized testnet state.",
      },
      // This route is observational. A provider-read failure is evidence the
      // proof is unavailable, not an HTTP failure of the page itself. Keeping
      // the diagnostic transport at 200 avoids browser-console noise while
      // the body remains explicit and fail-closed for every proof claim.
      { status: 200, headers },
    );
  }
}
