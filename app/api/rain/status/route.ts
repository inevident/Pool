import { NextRequest, NextResponse } from "next/server.js";
import {
  isRainConfigured,
  RainApiError,
  verifyRainConnection,
} from "../../../../lib/rain/client.ts";
import {
  canExecuteLiveDemo,
  getDemoAccessConfiguration,
  isDemoAccessConfigured,
} from "../../../../lib/security/demo-access.ts";
import {
  getMonadRainGate,
  getMonadWriteConfiguration,
  MonadRegistryError,
  verifyMonadOperatorReadiness,
} from "../../../../lib/monad/server.ts";
import {
  assertRateLimit,
  RequestBoundaryError,
} from "../../../../lib/agent/http.ts";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const executionRequested = process.env.RAIN_LIVE_EXECUTION_ENABLED === "true";
  const accessConfiguration = getDemoAccessConfiguration();
  const accessUnlocked = canExecuteLiveDemo(request);
  const accessRequired =
    !accessUnlocked &&
    (isDemoAccessConfigured() || accessConfiguration.required);
  const providerAccessLocked =
    process.env.NODE_ENV === "production" && !accessUnlocked;
  const monadConfiguration = getMonadWriteConfiguration();
  const monadGate = getMonadRainGate(monadConfiguration);
  if (!isRainConfigured()) {
    return NextResponse.json(
      {
        readiness: "unconfigured",
        configured: false,
        connected: false,
        environment: "rehearsal",
        liveExecutionEnabled: false,
        accessRequired,
        accessUnlocked,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
      },
      { headers: noStoreHeaders },
    );
  }
  if (
    !accessConfiguration.ready ||
    (accessConfiguration.present && !accessConfiguration.valid)
  ) {
    return NextResponse.json(
      {
        readiness: "blocked",
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled: false,
        accessRequired: true,
        accessUnlocked: false,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        code: "DEMO_ACCESS_CONFIGURATION_INVALID",
        message:
          "Live production actions require a POOL_DEMO_ACCESS_TOKEN of at least 24 characters.",
      },
      { headers: noStoreHeaders },
    );
  }
  if (accessRequired || providerAccessLocked) {
    return NextResponse.json(
      {
        readiness: "blocked",
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled: false,
        accessRequired: true,
        accessUnlocked: false,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        code: providerAccessLocked
          ? "RAIN_PROVIDER_ACCESS_LOCKED"
          : "DEMO_ACCESS_REQUIRED",
        message:
          "Production provider checks are locked until a protected demo session is present.",
      },
      { headers: noStoreHeaders },
    );
  }

  try {
    assertRateLimit(request, "rain-status-read", {
      maxRequests: 12,
      windowMs: 60_000,
    });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        {
          readiness: "blocked",
          configured: true,
          connected: false,
          environment: "sandbox",
          liveExecutionEnabled: false,
          accessRequired,
          accessUnlocked,
          monadRequired: monadConfiguration.required,
          monadReady: monadConfiguration.ready,
          code: error.code,
          message: error.message,
        },
        {
          status: error.status,
          headers: { ...noStoreHeaders, "Retry-After": "60" },
        },
      );
    }
    throw error;
  }

  if (!monadGate.allowed) {
    return NextResponse.json(
      {
        readiness: "blocked",
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
      { headers: noStoreHeaders },
    );
  }

  if (executionRequested && monadConfiguration.ready) {
    try {
      await verifyMonadOperatorReadiness();
    } catch (error) {
      return NextResponse.json(
        {
          readiness: "blocked",
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
        { headers: noStoreHeaders },
      );
    }
  }

  try {
    const status = await verifyRainConnection();
    return NextResponse.json(
      {
        readiness:
          executionRequested && accessUnlocked ? "ready" : "connected",
        configured: true,
        liveExecutionEnabled: executionRequested && accessUnlocked,
        accessRequired,
        accessUnlocked,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        integrationMode: monadGate.mode,
        message: monadGate.message ?? undefined,
        ...status,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message =
      error instanceof RainApiError
        ? error.message
        : "Rain sandbox could not be reached";
    return NextResponse.json(
      {
        readiness: "degraded",
        configured: true,
        connected: false,
        environment: "sandbox",
        liveExecutionEnabled: executionRequested && accessUnlocked,
        accessRequired,
        accessUnlocked,
        monadRequired: monadConfiguration.required,
        monadReady: monadConfiguration.ready,
        message,
      },
      { headers: noStoreHeaders },
    );
  }
}
