import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    kioskTerminalSession: {
      findUnique,
    },
  },
}));

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => cookiesMock(...args),
}));

describe("requireTerminalOrDev (kiosk session + IP)", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    findUnique.mockReset();
    cookiesMock.mockReset();
    process.env.ALLOWED_TERMINAL_IPS = "192.168.1.10";
    delete process.env.TERMINAL_SESSION_REQUIRED;
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.resetModules();
  });

  async function loadRequire() {
    vi.resetModules();
    const mod = await import("@/lib/punch/terminalGuard");
    return mod.requireTerminalOrDev;
  }

  it("rejects when IP not allowlisted", async () => {
    const requireTerminalOrDev = await loadRequire();
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toEqual({ ok: false, error: "IP non autorisée" });
  });

  it("allows dev bypass in non-production with dev=1", async () => {
    process.env.NODE_ENV = "test";
    const requireTerminalOrDev = await loadRequire();
    const req = new Request("https://app.test/api/punch?dev=1", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toMatchObject({ ok: true, dev: true });
  });

  it("when session not required, allowlisted IP succeeds without cookie", async () => {
    process.env.TERMINAL_SESSION_REQUIRED = "false";
    const requireTerminalOrDev = await loadRequire();
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toMatchObject({ ok: true, dev: false, terminalCompanyId: null });
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("when session required and no cookie, returns error", async () => {
    const requireTerminalOrDev = await loadRequire();
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    });
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toEqual({ ok: false, error: "Terminal non autorisé" });
  });

  it("when session unknown in DB, returns error", async () => {
    const requireTerminalOrDev = await loadRequire();
    findUnique.mockResolvedValue(null);
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === "terminal_session" ? { value: "bad-id" } : undefined),
    });
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toEqual({ ok: false, error: "Terminal non autorisé" });
  });

  it("when terminal inactive, returns error", async () => {
    const requireTerminalOrDev = await loadRequire();
    findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      terminal: { isActive: false, companyId: "c1" },
    });
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === "terminal_session" ? { value: "sid" } : undefined),
    });
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toEqual({ ok: false, error: "Terminal désactivé" });
  });

  it("when session expired, returns error", async () => {
    const requireTerminalOrDev = await loadRequire();
    findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      terminal: { isActive: true, companyId: "c1" },
    });
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === "terminal_session" ? { value: "sid" } : undefined),
    });
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toEqual({ ok: false, error: "Session terminal expirée" });
  });

  it("when session valid, returns company id", async () => {
    const requireTerminalOrDev = await loadRequire();
    findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 3600_000),
      terminal: { isActive: true, companyId: "company-uuid" },
    });
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === "terminal_session" ? { value: "sid" } : undefined),
    });
    const req = new Request("https://app.test/api/punch", {
      headers: { "x-real-ip": "192.168.1.10" },
    });
    const r = await requireTerminalOrDev(req);
    expect(r).toMatchObject({
      ok: true,
      dev: false,
      terminalCompanyId: "company-uuid",
    });
  });
});
