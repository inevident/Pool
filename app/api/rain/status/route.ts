import { NextResponse } from "next/server";
import {
  isRainConfigured,
  RainApiError,
  verifyRainConnection,
} from "../../../../lib/rain/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isRainConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      environment: "rehearsal",
      liveExecutionEnabled: false,
    });
  }

  try {
    const status = await verifyRainConnection();
    return NextResponse.json({
      configured: true,
      liveExecutionEnabled:
        process.env.RAIN_LIVE_EXECUTION_ENABLED === "true",
      ...status,
    });
  } catch (error) {
    const message =
      error instanceof RainApiError
        ? error.message
        : "Rain sandbox could not be reached";
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled:
          process.env.RAIN_LIVE_EXECUTION_ENABLED === "true",
        message,
      },
      { status: 503 },
    );
  }
}
