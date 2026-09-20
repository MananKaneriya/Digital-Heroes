import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

/**
 * Regression test for the Render reverse-proxy IP-resolution bug: without
 * `app.set("trust proxy", 1)`, Express's req.ip ignores X-Forwarded-For and
 * falls back to the socket's remoteAddress — which, behind Render's single
 * edge-proxy hop, is the proxy's own address for every external request.
 * express-rate-limit's default keyGenerator (used by authRateLimiter and
 * apiRateLimiter) is req.ip, so that bug collapsed every user into one shared
 * rate-limit bucket. These tests exercise the real createApp() output rather
 * than a reimplementation, so they fail if the trust-proxy configuration is
 * ever removed or weakened.
 */
describe("createApp trust proxy configuration", () => {
  it("configures Express to trust exactly one reverse-proxy hop", () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(1);
  });

  it("resolves req.ip from X-Forwarded-For (not the proxy's own socket address)", () => {
    const app = createApp();
    const req = Object.create(app.request) as { app: typeof app; connection: unknown; socket: unknown; headers: Record<string, string>; ip: string };
    req.app = app;
    req.connection = { remoteAddress: "10.0.0.5" }; // Render's internal edge-proxy address
    req.socket = req.connection;
    req.headers = { "x-forwarded-for": "203.0.113.7" }; // the real client's IP, as Render's proxy reported it

    expect(req.ip).toBe("203.0.113.7");
    expect(req.ip).not.toBe("10.0.0.5");
  });

  it("resolves two different real clients behind the same Render proxy to two different IPs", () => {
    const app = createApp();
    const makeReq = (xForwardedFor: string) => {
      const req = Object.create(app.request) as { app: typeof app; connection: unknown; socket: unknown; headers: Record<string, string>; ip: string };
      req.app = app;
      req.connection = { remoteAddress: "10.0.0.5" }; // same proxy for both — this is what made every user collapse into one bucket before the fix
      req.socket = req.connection;
      req.headers = { "x-forwarded-for": xForwardedFor };
      return req;
    };

    const clientA = makeReq("203.0.113.7");
    const clientB = makeReq("198.51.100.9");

    expect(clientA.ip).toBe("203.0.113.7");
    expect(clientB.ip).toBe("198.51.100.9");
    expect(clientA.ip).not.toBe(clientB.ip);
  });
});
