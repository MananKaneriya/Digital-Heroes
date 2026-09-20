import type { NextFunction, Request, Response } from "express";
import type { Role } from "@digital-heroes/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { categoryLogger } from "../lib/logger.js";

const securityLog = categoryLogger("security");

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      accessToken?: string;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

async function loadAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    throw AppError.unauthorized("Your session is invalid or has expired.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    throw AppError.unauthorized("Account profile could not be loaded.");
  }

  return {
    id: userData.user.id,
    email: userData.user.email ?? "",
    fullName: profile.full_name,
    role: profile.role as Role,
  };
}

/** Requires a valid session. Rejects with 401 otherwise. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) throw AppError.unauthorized();
  req.accessToken = token;
  req.user = await loadAuthenticatedUser(token);
  next();
});

/** Populates req.user when a valid token is present, but never rejects the request. */
export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (token) {
    req.accessToken = token;
    try {
      req.user = await loadAuthenticatedUser(token);
    } catch {
      // Public/optional routes proceed unauthenticated on invalid tokens.
    }
  }
  next();
});

/** Restricts a route to one or more roles. Must run after requireAuth. */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw AppError.unauthorized();
    if (!allowed.includes(req.user.role)) {
      securityLog.warn(
        { userId: req.user.id, role: req.user.role, allowed, path: req.path, requestId: req.requestId },
        "authorization denied",
      );
      throw AppError.forbidden();
    }
    next();
  };
}
