import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * IP allowlist + proxy headers (`x-forwarded-for`, `x-real-ip`, `::ffff`).
 * File name is explicit so `npm run test` output shows IP coverage in the jury screenshot.
 */
describe("getTerminalIpCheck (IP allowlist)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    vi.resetModules();
  });

  async function loadIpCheck() {
    vi.resetModules();
    const mod = await import("@/lib/punch/terminalGuard");
    return mod.getTerminalIpCheck;
  }

  it("uses first IP from x-forwarded-for and matches allowlist", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "10.0.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/api", {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
    });
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("10.0.0.1");
    expect(r.allowed).toBe(true);
  });

  it("trims whitespace around the first forwarded IP", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "10.0.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/api", {
      headers: { "x-forwarded-for": "  10.0.0.1  , 10.0.0.2" },
    });
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("10.0.0.1");
    expect(r.allowed).toBe(true);
  });

  it("prefers x-forwarded-for over x-real-ip (client IP is first hop only)", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "10.0.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/api", {
      headers: {
        "x-forwarded-for": "203.0.113.50",
        "x-real-ip": "10.0.0.1",
      },
    });
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("203.0.113.50");
    expect(r.allowed).toBe(false);
  });

  it("normalizes IPv6-mapped IPv4 in header", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "10.0.0.2";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/", {
      headers: { "x-forwarded-for": "::ffff:10.0.0.2" },
    });
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("10.0.0.2");
    expect(r.allowed).toBe(true);
  });

  it("normalizes allowlist entries with ::ffff prefix", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "::ffff:192.168.0.5";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/", {
      headers: { "x-real-ip": "192.168.0.5" },
    });
    const r = getTerminalIpCheck(req);
    expect(r.allowed).toBe(true);
  });

  it("marks unknown when IP not on allowlist", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "10.0.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("8.8.8.8");
    expect(r.allowed).toBe(false);
  });

  it("uses x-real-ip when x-forwarded-for absent", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "172.16.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/", {
      headers: { "x-real-ip": "172.16.0.1" },
    });
    expect(getTerminalIpCheck(req).allowed).toBe(true);
  });

  it("reports unknown when no proxy headers", async () => {
    process.env.ALLOWED_TERMINAL_IPS = "127.0.0.1";
    const getTerminalIpCheck = await loadIpCheck();
    const req = new Request("https://example.com/");
    const r = getTerminalIpCheck(req);
    expect(r.ip).toBe("unknown");
    expect(r.allowed).toBe(false);
  });

  it("exposes terminalSessionRequired default true", async () => {
    delete process.env.TERMINAL_SESSION_REQUIRED;
    process.env.ALLOWED_TERMINAL_IPS = "1.1.1.1";
    const getTerminalIpCheck = await loadIpCheck();
    expect(
      getTerminalIpCheck(new Request("https://x/", { headers: { "x-real-ip": "1.1.1.1" } })).terminalSessionRequired
    ).toBe(true);
  });

  it("exposes terminalSessionRequired false when env is false", async () => {
    process.env.TERMINAL_SESSION_REQUIRED = "false";
    process.env.ALLOWED_TERMINAL_IPS = "1.1.1.1";
    const getTerminalIpCheck = await loadIpCheck();
    expect(
      getTerminalIpCheck(new Request("https://x/", { headers: { "x-real-ip": "1.1.1.1" } })).terminalSessionRequired
    ).toBe(false);
  });
});
