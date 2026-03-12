// src/lib/punch/terminalGuard.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const ALLOWED_TERMINAL_IPS = new Set([
  "127.0.0.1",
  "::1",
  "10.7.32.201",
]);

function getClientIP(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();

  const real = req.headers.get("x-real-ip");
  if (real) return real;

  return "unknown";
}

export async function requireTerminalOrDev(req: Request) {
  const url = new URL(req.url);
  const isDevBypass = process.env.NODE_ENV !== "production" && url.searchParams.get("dev") === "1";

  if (isDevBypass) {
    return {
      ok: true as const,
      terminalCompanyId: null as string | null,
      dev: true as const,
    };
  }

  const ip = getClientIP(req);
  if (!ip || !ALLOWED_TERMINAL_IPS.has(ip)) {
    return { ok: false as const, error: "IP non autorisée" };
  }

  const jar = await cookies();
  const sid = jar.get("kiosk_terminal_session")?.value ?? "";

  if (!sid) {
    return { ok: false as const, error: "Terminal non autorisé" };
  }

  const row = await prisma.kioskTerminalSession.findUnique({
    where: { id: sid },
    select: {
      expiresAt: true,
      terminal: {
        select: {
          isActive: true,
          companyId: true,
        },
      },
    },
  });

  if (!row) {
    return { ok: false as const, error: "Terminal non autorisé" };
  }

  if (!row.terminal.isActive) {
    return { ok: false as const, error: "Terminal désactivé" };
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "Session terminal expirée" };
  }

  return {
    ok: true as const,
    terminalCompanyId: row.terminal.companyId,
    dev: false as const,
  };
}
