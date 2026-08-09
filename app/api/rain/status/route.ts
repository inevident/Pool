import { NextRequest, NextResponse } from "next/server";
import {
  isRainConfigured,
  RainApiError,
  verifyRainConnection,
} from "../../../../lib/rain/client";
import {
  canExecuteLiveDemo,
  getDemoAccessConfiguration,
  isDemoAccessConfigured,
} from "../../../../lib/security/demo-access";
import {
  getMonadRainGate,
  getMonadWriteConfiguration,
  MonadRegistryError,
  verifyMonadOperatorReadiness,
} from "../../../../lib/monad/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const executionRequested = process.env.RAIN_LIVE_EXECUTION_ENABLED === "true";
  const accessConfiguration = getDemoAccessConfiguration();
  const accessUnlocked = canExecuteLiveDemo(request);
  const accessRequired =
    !accessUnlocked &&
    (isDemoAccessConfigured() || accessConfiguration.required);
  const monadConfiguration = getMonadWriteConfiguration();
  const monadGate = getMonadRainGate(monadConfiguration);
  if (!isRainConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      environment: "rehearsal",
      liveExecutionEnabled: false,
      accessRequired,
      accessUnlocked,
      monadRequired: monadConfiguration.required,
      monadReady: monadConfiguration.ready,
    });
  }
  if (!accessConfiguration.ready || (accessConfiguration.present && !accessConfiguration.valid)) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled: false,
        accessRequired: true,
        accessUnlocked: false,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        message:
          "Live production actions require a POOL_DEMO_ACCESS_TOKEN of at least 24 characters.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (accessRequired) {
    return NextResponse.json({
      configured: true,
      connected: false,
      environment: "sandbox",
      liveExecutionEnabled: false,
      accessRequired: true,
      accessUnlocked: false,
      monadRequired: monadConfiguration.required,
      monadReady: monadConfiguration.ready,
      message: "Unlock the protected demo before contacting Rain.",
    });
  }

  if (!monadGate.allowed) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled: false,
        accessRequired,
        accessUnlocked,
        monadRequired: monadConfiguration.required,
        monadReady: false,
        integrationMode: "blocked",
        code: monadGate.code,
        message: monadGate.message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (executionRequested && monadConfiguration.ready) {
    try {
      await verifyMonadOperatorReadiness();
    } catch (error) {
      return NextResponse.json(
        {
          configured: true,
          connected: false,
          environment: "sandbox",
          liveExecutionEnabled: false,
          accessRequired,
          accessUnlocked,
          monadRequired: monadConfiguration.required,
          monadReady: false,
          integrationMode: "blocked",
          code:
            error instanceof MonadRegistryError
              ? error.code
              : "MONAD_OPERATOR_READINESS_FAILED",
          message:
            error instanceof MonadRegistryError
              ? error.message
              : "Monad operator readiness could not be verified.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  try {
    const status = await verifyRainConnection();
    return NextResponse.json({
      configured: true,
      liveExecutionEnabled:
        executionRequested && accessUnlocked,
      accessRequired,
      accessUnlocked,
      monadRequired: monadConfiguration.required,
      monadReady: monadConfiguration.ready,
      integrationMode: monadGate.mode,
      message: monadGate.message ?? undefined,
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
          executionRequested && accessUnlocked,
        accessRequired,
        accessUnlocked,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        message,
      },
      { status: 503 },
    );
  }
}
