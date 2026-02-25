// src/lib/punch/terminalGuard.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function requireTerminalOrDev(req: Request) {
  const isDevBypass =
    process.env.PUNCH_DEV_BYPASS === "1" &&
    (process.env.NODE_ENV !== "production") &&
    new URL(req.url).searchParams.get("dev") === "1";

  if (isDevBypass) {
    return { ok: true as const, terminalCompanyId: null as string | null, dev: true as const };
  }

  const jar = await cookies();
  const sid = jar.get("kiosk_terminal_session")?.value ?? "";
  if (!sid) return { ok: false as const, error: "Terminal non autorisé" };

  const row = await prisma.kioskTerminalSession.findUnique({
    where: { id: sid },
    select: {
      expiresAt: true,
      terminal: { select: { isActive: true, companyId: true } },
    },
  });

  if (!row) return { ok: false as const, error: "Terminal non autorisé" };
  if (!row.terminal.isActive) return { ok: false as const, error: "Terminal désactivé" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false as const, error: "Session terminal expirée" };

  return { ok: true as const, terminalCompanyId: row.terminal.companyId, dev: false as const };
}