export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { messageFromUnknown } from "@/lib/unknownError";

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = (await req.json().catch(() => null)) as { employeeId?: string } | null;
    const employeeId = String(body?.employeeId ?? "").trim();
    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "employeeId requis." }, { status: 400 });
    }

    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: auth.companyId, isActive: true },
      select: { id: true },
    });
    if (!emp) {
      return NextResponse.json({ ok: false, error: "Employé introuvable." }, { status: 404 });
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { punchKioskLocked: false },
    });

    await prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action: "PUNCH_KIOSK_UNLOCKED",
        target: employeeId,
        meta: { employeeId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: messageFromUnknown(e) || "Erreur serveur" }, { status: 500 });
  }
}
