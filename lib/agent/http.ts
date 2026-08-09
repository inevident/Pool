const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 12;

interface RateWindow {
  count: number;
  resetAt: number;
}

const windows = new Map<string, RateWindow>();

export class RequestBoundaryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RequestBoundaryError";
    this.status = status;
    this.code = code;
  }
}

function boundedClientKey(request: Request) {
  const candidate =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "anonymous";
  return /^[a-fA-F0-9.:]{1,64}$/.test(candidate) ? candidate : "anonymous";
}

/**
 * Best-effort isolate-local throttling. The deployment edge remains the durable
 * rate-limit boundary; this prevents accidental rapid repeats inside one worker.
 */
export function assertRateLimit(
  request: Request,
  namespace: string,
  options: { maxRequests?: number; windowMs?: number; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const key = `${namespace}:${boundedClientKey(request)}`;
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= maxRequests) {
    throw new RequestBoundaryError(
      429,
      "RATE_LIMITED",
      "Too many requests. Wait a moment and try again.",
    );
  }

  current.count += 1;
}

export function assertSameOriginJsonAction(request: Request, action: string) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestBoundaryError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "This endpoint accepts application/json only.",
    );
  }

  if (request.headers.get("x-pool-agent-action") !== action) {
    throw new RequestBoundaryError(
      403,
      "INVALID_ACTION_HEADER",
      "The request did not include the required POOL action header.",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new RequestBoundaryError(400, "INVALID_REQUEST_URL", "Invalid request URL.");
  }

  if (origin !== requestOrigin) {
    throw new RequestBoundaryError(
      403,
      "ORIGIN_REJECTED",
      "Cross-origin agent actions are not allowed.",
    );
  }
}

export async function readLimitedJson(request: Request, maxBytes = 2_048): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBoundaryError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }

  if (!request.body) {
    throw new RequestBoundaryError(400, "EMPTY_BODY", "A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new RequestBoundaryError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new RequestBoundaryError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;
