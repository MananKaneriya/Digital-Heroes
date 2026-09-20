import type { AuthUserDTO } from "@digital-heroes/shared";
import { supabaseAdmin, supabasePublic } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import { recordAudit } from "../audit/audit.service.js";
import type { SignInInput, SignUpInput } from "./auth.schemas.js";

const securityLog = categoryLogger("security");

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: AuthUserDTO;
}

/**
 * Supabase's AuthError carries an HTTP-like `status` for genuine client-side
 * problems (bad credentials, already-registered email, weak password, ...).
 * Anything without a 4xx status is an infrastructure problem (auth service
 * unreachable, misconfigured project, timeout) and must never be reported to
 * the caller as if it were their mistake, nor leak the raw error message
 * (PRD §18/§23: never expose internal/infrastructure details).
 */
function isClientAuthError(error: { status?: number }): boolean {
  return typeof error.status === "number" && error.status >= 400 && error.status < 500;
}

function authServiceUnavailable(error: unknown): AppError {
  securityLog.error({ err: error }, "auth provider request failed");
  return AppError.internal("The authentication service is temporarily unavailable. Please try again shortly.");
}

async function loadProfile(userId: string, email: string) {
  const { data, error } = await supabaseAdmin.from("profiles").select("full_name, role").eq("id", userId).single();
  if (error || !data) throw AppError.internal("Account profile could not be loaded.");
  return { id: userId, email, fullName: data.full_name, role: data.role } satisfies AuthUserDTO;
}

export async function signUp(input: SignUpInput, requestId: string): Promise<AuthSession> {
  const { data, error } = await supabasePublic.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  });

  if (error) {
    // Supabase returns 422/400 with a generic message for "already registered" to avoid
    // account enumeration; we pass that specific client-facing message straight through.
    // Anything else (network failure, misconfigured project, timeout) is our problem, not theirs.
    if (isClientAuthError(error)) throw AppError.validation(error.message);
    throw authServiceUnavailable(error);
  }
  if (!data.user || !data.session) {
    throw AppError.internal("Signup did not return a valid session.");
  }

  await recordAudit({
    actorId: data.user.id,
    actorRole: "subscriber",
    action: "account.signup",
    entityType: "user",
    entityId: data.user.id,
    newState: { email: input.email },
    requestId,
  });

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    user: await loadProfile(data.user.id, data.user.email ?? input.email),
  };
}

export async function signIn(input: SignInInput, requestId: string): Promise<AuthSession> {
  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    if (isClientAuthError(error)) throw AppError.unauthorized("Invalid email or password.");
    throw authServiceUnavailable(error);
  }
  if (!data.session || !data.user) {
    throw AppError.unauthorized("Invalid email or password.");
  }

  await recordAudit({
    actorId: data.user.id,
    actorRole: null,
    action: "account.login",
    entityType: "user",
    entityId: data.user.id,
    requestId,
  });

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    user: await loadProfile(data.user.id, data.user.email ?? input.email),
  };
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    if (isClientAuthError(error)) throw AppError.unauthorized("Your session has expired. Please log in again.");
    throw authServiceUnavailable(error);
  }
  if (!data.session || !data.user) {
    throw AppError.unauthorized("Your session has expired. Please log in again.");
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    user: await loadProfile(data.user.id, data.user.email ?? ""),
  };
}

export async function signOut(accessToken: string): Promise<void> {
  await supabaseAdmin.auth.admin.signOut(accessToken, "global").catch(() => {
    // Best-effort revoke; the client discards its local tokens regardless.
  });
}

export async function getMe(userId: string, email: string): Promise<AuthUserDTO> {
  return loadProfile(userId, email);
}
