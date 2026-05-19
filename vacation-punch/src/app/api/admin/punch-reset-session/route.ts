export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeShiftStatus,
  fetchEmployeePunchHistory,
  type PunchType,
} from "@/lib/punch/shiftStatus";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { messageFromUnknown } from "@/lib/unknownError";

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = (await req.json().catch(() => null)) as { employeeId?: string; atISO?: string } | null;
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

    const history = await fetchEmployeePunchHistory(employeeId);
    const status = computeShiftStatus(
      history.map((h) => ({ type: h.type as PunchType, at: h.at, shiftId: h.shiftId })),
      new Date()
    );

    let closed = false;
    if (status.sessionOpen) {
      let at = new Date();
      if (body?.atISO && String(body.atISO).trim()) {
        at = new Date(String(body.atISO));
        if (Number.isNaN(at.getTime())) {
          return NextResponse.json({ ok: false, error: "Date/heure invalide." }, { status: 400 });
        }
      }

      const lastIn = [...history].reverse().find((p) => p.type === "CLOCK_IN");
      if (lastIn && at.getTime() < lastIn.at.getTime()) {
        return NextResponse.json(
          { ok: false, error: "La sortie doit être après la dernière entrée." },
          { status: 400 }
        );
      }

      await prisma.punchEvent.create({
        data: {
          employeeId,
          type: "CLOCK_OUT",
          source: "ADMIN",
          shiftId: status.lastClockInShiftId ?? lastIn?.shiftId ?? null,
          at,
        },
      });
      closed = true;
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { punchKioskLocked: false },
    });

    await prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action: "PUNCH_SESSION_RESET",
        target: employeeId,
        meta: { employeeId, closedOpenSession: closed },
      },
    });

    return NextResponse.json({ ok: true, closedOpenSession: closed });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: messageFromUnknown(e) || "Erreur serveur" }, { status: 500 });
  }
}
