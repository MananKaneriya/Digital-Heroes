import { createClient, type RealtimeClientOptions } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "../config/env.js";

/**
 * The backend never uses Supabase Realtime, but supabase-js still constructs a
 * RealtimeClient on client creation, which requires a WebSocket implementation.
 * Node.js (< 22) has no global WebSocket, so we supply the `ws` package explicitly
 * to avoid a crash at client-creation time (see @supabase/realtime-js).
 */
const realtime: RealtimeClientOptions = { transport: WebSocket as unknown as RealtimeClientOptions["transport"] };

/**
 * Every request Supabase makes gets a hard upper bound. Without this, a slow
 * or unreachable Supabase project (or, as observed against a deliberately
 * fake placeholder URL in local dev, an exhausted connection pool from
 * repeated failed connection attempts) leaves the underlying fetch pending
 * forever — the request never resolves, times out, or errors, so the caller
 * hangs indefinitely instead of getting a clean failure. An infrastructure
 * outage must degrade to a fast, clean error, never an indefinite hang.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ?? controller.signal }).finally(() => clearTimeout(timeout));
}

/**
 * Service-role client: bypasses Row Level Security. Used only inside trusted
 * server-side services, never exposed to a request handler's response.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime,
  global: { fetch: fetchWithTimeout },
});

/**
 * Anon-key client used specifically for the Supabase Auth flows we proxy through our own
 * API (signup/login) so our rate limiter and audit logging sit in front of them, rather
 * than letting the browser call Supabase Auth directly.
 */
export const supabasePublic = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime,
  global: { fetch: fetchWithTimeout },
});

/**
 * Creates a client scoped to a specific end-user's JWT so RLS policies apply.
 * Prefer this over supabaseAdmin whenever the operation should be constrained
 * to what that user is allowed to see/change.
 */
export function supabaseForUser(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch: fetchWithTimeout },
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  });
}
