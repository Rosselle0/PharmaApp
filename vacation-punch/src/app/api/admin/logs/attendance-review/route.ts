export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { messageFromUnknown } from "@/lib/unknownError";
import { isAutoPunchShift } from "@/lib/punch/shiftNotes";

function parseDatetimeLocal(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = await req.json();

    const shiftId = String(body?.shiftId ?? "").trim();
    const actionRaw = String(body?.action ?? "").toUpperCase();
    const action = actionRaw === "CONFIRM" || actionRaw === "DECLINE" ? actionRaw : null;

    if (!shiftId || !action) {
      return NextResponse.json({ ok: false, error: "Entrée invalide" }, { status: 400 });
    }

    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, employee: { companyId: auth.companyId } },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        note: true,
        attendanceReview: true,
      },
    });

    if (!shift) {
      return NextResponse.json({ ok: false, error: "Quart introuvable" }, { status: 404 });
    }

    if (isAutoPunchShift(shift.note) || shift.note === "VAC") {
      return NextResponse.json({ ok: false, error: "Quart non modifiable" }, { status: 400 });
    }

    if (action === "DECLINE") {
      await prisma.$transaction([
        prisma.shift.update({
          where: { id: shiftId },
          data: { attendanceReview: "DECLINED", status: "CANCELED" },
        }),
        prisma.auditLog.create({
          data: {
            actorId: auth.userId,
            companyId: auth.companyId,
            action: "ATTENDANCE_DECLINED",
            target: shiftId,
            meta: { employeeId: shift.employeeId },
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    const startAt = parseDatetimeLocal(String(body?.startAt ?? ""));
    const endAt = parseDatetimeLocal(String(body?.endAt ?? ""));
    const clockInAt = parseDatetimeLocal(String(body?.clockInAt ?? ""));
    const clockOutAt = parseDatetimeLocal(String(body?.clockOutAt ?? ""));

    const newStart = startAt ?? shift.startTime;
    const newEnd = endAt ?? shift.endTime;
    if (newEnd.getTime() <= newStart.getTime()) {
      return NextResponse.json({ ok: false, error: "Heure de fin invalide" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: shiftId },
        data: {
          attendanceReview: "CONFIRMED",
          status: "COMPLETED",
          startTime: newStart,
          endTime: newEnd,
        },
      });

      const existing = await tx.punchEvent.findMany({
        where: { shiftId, type: { in: ["CLOCK_IN", "CLOCK_OUT"] } },
        select: { id: true, type: true },
      });
      const hasIn = existing.some((p) => p.type === "CLOCK_IN");
      const hasOut = existing.some((p) => p.type === "CLOCK_OUT");

      if (clockInAt && !hasIn) {
        await tx.punchEvent.create({
          data: {
            employeeId: shift.employeeId,
            shiftId,
            type: "CLOCK_IN",
            at: clockInAt,
            source: "ADMIN",
          },
        });
      }
      if (clockOutAt && !hasOut) {
        await tx.punchEvent.create({
          data: {
            employeeId: shift.employeeId,
            shiftId,
            type: "CLOCK_OUT",
            at: clockOutAt,
            source: "ADMIN",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          companyId: auth.companyId,
          action: "ATTENDANCE_CONFIRMED",
          target: shiftId,
          meta: {
            employeeId: shift.employeeId,
            startAt: newStart.toISOString(),
            endAt: newEnd.toISOString(),
            clockInAt: clockInAt?.toISOString() ?? null,
            clockOutAt: clockOutAt?.toISOString() ?? null,
          },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: messageFromUnknown(e) || "Échec" }, { status: 500 });
  }
}
