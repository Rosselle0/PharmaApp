import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function requireTerminal() {
  const jar = await cookies();
  const sid = jar.get("terminal_session")?.value;
  if (!sid) return { ok: false as const, error: "Terminal non autorisé" };

  const session = await prisma.kioskTerminalSession.findUnique({
    where: { id: sid },
    select: {
      id: true,
      expiresAt: true,
      terminal: { select: { id: true, isActive: true, companyId: true } },
    },
  });

  if (!session) return { ok: false as const, error: "Session terminal invalide" };
  if (!session.terminal.isActive) return { ok: false as const, error: "Terminal désactivé" };
  if (session.expiresAt.getTime() < Date.now()) return { ok: false as const, error: "Session expirée" };

  return {
    ok: true as const,
    terminalId: session.terminal.id,
    companyId: session.terminal.companyId,
  };
}