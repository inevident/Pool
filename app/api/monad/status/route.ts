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
      { status: 503, headers },
    );
  }
}
