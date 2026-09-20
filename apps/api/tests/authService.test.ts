import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, signUpMock } = vi.hoisted(() => ({ fromMock: vi.fn(), signUpMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock },
  supabasePublic: { auth: { signUp: signUpMock } },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

import { signUp } from "../src/modules/auth/auth.service.js";

function chainable(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  return builder;
}

const input = { email: "new@example.com", password: "Password123!", fullName: "New User" };

beforeEach(() => {
  fromMock.mockReset();
  signUpMock.mockReset();
  recordAuditMock.mockClear();
});

describe("signUp", () => {
  it("returns a session and audits the signup when Supabase issues a session immediately (email confirmation off)", async () => {
    signUpMock.mockResolvedValueOnce({
      data: {
        user: { id: "user-1", email: "new@example.com" },
        session: { access_token: "at-1", refresh_token: "rt-1", expires_at: 12345 },
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(chainable({ data: { full_name: "New User", role: "subscriber" }, error: null }));

    const session = await signUp(input, "req-1");

    expect(session).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: 12345,
      user: { id: "user-1", email: "new@example.com", fullName: "New User", role: "subscriber" },
    });
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "account.signup", actorId: "user-1" }));
  });

  it("Phase: reports a clear, non-internal 'confirmation required' error (not INTERNAL_ERROR) when Supabase creates the user but withholds a session, and still audits the signup", async () => {
    // This is Supabase's documented behavior when the project's "Confirm email"
    // setting is enabled: signUp() succeeds (no error) and returns a user, but
    // session is null until the user clicks the confirmation link.
    signUpMock.mockResolvedValueOnce({
      data: { user: { id: "user-2", email: "new@example.com" }, session: null },
      error: null,
    });

    await expect(signUp(input, "req-1")).rejects.toMatchObject({
      status: 403,
      code: "EMAIL_CONFIRMATION_REQUIRED",
    });

    // The account was genuinely created — this must still be an audited signup,
    // not silently dropped just because no session came back.
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "account.signup", actorId: "user-2" }));
    // loadProfile must never be reached — there is no session to build one for.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("still reports an internal error (not a confirmation-required error) when Supabase returns neither a user nor an error", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });

    await expect(signUp(input, "req-1")).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("passes through a client-facing validation error for a genuine Supabase error (e.g. already registered)", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { status: 422, message: "User already registered" },
    });

    await expect(signUp(input, "req-1")).rejects.toMatchObject({ status: 400, message: "User already registered" });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("reports a generic service-unavailable error for a non-client (infrastructure) Supabase error", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { status: 500, message: "internal supabase failure" },
    });

    await expect(signUp(input, "req-1")).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The authentication service is temporarily unavailable. Please try again shortly.",
    });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});
