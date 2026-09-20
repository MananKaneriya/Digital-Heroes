import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole, type AuthenticatedUser } from "../src/middleware/auth.js";
import { AppError } from "../src/lib/errors.js";

function makeRequest(user?: AuthenticatedUser): Request {
  return { user, path: "/test", requestId: "req-1" } as unknown as Request;
}

describe("requireRole", () => {
  it("throws unauthorized when no user is attached", () => {
    const next = vi.fn();
    expect(() => requireRole("admin")(makeRequest(undefined), {} as Response, next)).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("throws forbidden when the user's role is not in the allowed list", () => {
    const user: AuthenticatedUser = { id: "u1", email: "a@b.com", fullName: null, role: "subscriber" };
    const next = vi.fn();
    try {
      requireRole("admin")(makeRequest(user), {} as Response, next);
      expect.fail("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the user's role is allowed", () => {
    const user: AuthenticatedUser = { id: "u1", email: "a@b.com", fullName: null, role: "admin" };
    const next = vi.fn();
    requireRole("admin", "subscriber")(makeRequest(user), {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
