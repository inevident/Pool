/**
 * CORS for the browser-extension endpoints.
 *
 * Unlike POOL's same-origin agent actions, these routes are called from a
 * `chrome-extension://` origin as the shopper browses the open web. They are
 * read-only catalog lookups and an unauthenticated "please list this" request,
 * so a permissive allow-origin is acceptable — they never move money, never read
 * private buyer state, and are rate limited. Everything cacheable is still marked
 * no-store because matches depend on the live catalog.
 */
export const extensionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function extensionPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}
