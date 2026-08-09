import {
  getMonadWriteConfiguration,
  verifyMonadOperatorReadiness,
} from "../lib/monad/server.ts";
import {
  DEMO_ACCESS_MIN_LENGTH,
  getDemoAccessConfiguration,
} from "../lib/security/demo-access.ts";

const present = (name) => Boolean(process.env[name]?.trim());

const rainFields = [
  "RAIN_API_KEY",
  "RAIN_TEAM_ID",
  "RAIN_USER_ID",
  "RAIN_CONTRACT_ID",
];
const rainConfigured = rainFields.every(present);
const rainLive = process.env.RAIN_LIVE_EXECUTION_ENABLED === "true";
const monad = getMonadWriteConfiguration();
const access = getDemoAccessConfiguration();
let operatorReadiness = monad.ready ? "checking finalized registry" : "not checked";
const failures = [];

for (const issue of monad.issues) {
  failures.push(`${issue.code}: ${issue.message}`);
}
if (monad.required && !monad.ready && monad.issues.length === 0) {
  failures.push(
    "MONAD_CONFIGURATION_REQUIRED: production live Rain or MONAD_LIVE_REQUIRED=true requires a valid registry address and operator key.",
  );
}
if (monad.ready) {
  try {
    await verifyMonadOperatorReadiness();
    operatorReadiness = "finalized operator match";
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "MONAD_OPERATOR_READINESS_FAILED";
    operatorReadiness = `not ready (${code})`;
    failures.push(
      `${code}: the configured Monad signer, registry bytecode, chain, and finalized operator must be verified before Rain runs.`,
    );
  }
}

const rows = [
  ["Runtime profile", process.env.NODE_ENV === "production" ? "production" : "development"],
  ["Rain credentials", rainConfigured ? "ready" : "rehearsal only"],
  ["Rain live execution", rainLive ? "enabled" : "disabled"],
  ["OpenAI intent agent", present("OPENAI_API_KEY") ? "live" : "deterministic fallback"],
  ["Monad requirement", monad.required ? "required" : "optional in local development"],
  ["Monad configuration", monad.state],
  ["Monad operator", operatorReadiness],
  [
    "Public live-action lock",
    access.valid
      ? "ready"
      : access.required
        ? "missing or invalid"
        : "local development only",
  ],
];

console.log("POOL judge-demo preflight");
for (const [label, value] of rows) console.log(`${label.padEnd(24)} ${value}`);

if (rainLive && !rainConfigured) {
  failures.push("RAIN_LIVE_EXECUTION_ENABLED=true but one or more Rain credentials are missing.");
}
if (access.present && !access.valid) {
  failures.push(
    `POOL_DEMO_ACCESS_TOKEN must be at least ${DEMO_ACCESS_MIN_LENGTH} characters when configured.`,
  );
}
if (access.required && !access.valid) {
  failures.push(
    `Production live Rain or an explicitly required Monad run needs POOL_DEMO_ACCESS_TOKEN with at least ${DEMO_ACCESS_MIN_LENGTH} characters.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Preflight passed. No secret values were printed.");
}
