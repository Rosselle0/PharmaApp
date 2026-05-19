export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma, punchPrismaErrorUserMessage } from "@/lib/prisma";
import { lateMsFromPlannedStart } from "@/lib/punch/late";
import { resolvePunchKioskLocked } from "@/lib/punch/kioskLockDay";
import { findTodayShiftForEmployee } from "@/lib/punch/todayShift";
import {
  computeShiftStatus,
  fetchEmployeePunchHistory,
  type PunchType,
} from "@/lib/punch/shiftStatus";
import { requireEmployeeFromKioskOrCode, requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";

async function buildPunchStatePayload(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, punchKioskLocked: true },
  });

  if (!employee) {
    return { error: "Employé introuvable", status: 404 as const };
  }

  const history = await fetchEmployeePunchHistory(employeeId);
  const status = computeShiftStatus(
    history.map((h) => ({ type: h.type as PunchType, at: h.at, shiftId: h.shiftId })),
    new Date()
  );
  const now = new Date();
  const punchKioskLocked = await resolvePunchKioskLocked(employee.id, Boolean(employee.punchKioskLocked), now);
  const plannedShift =
    status.state === "OUT" ? await findTodayShiftForEmployee(employeeId, now) : null;
  const lateMs = plannedShift ? lateMsFromPlannedStart(plannedShift.startTime, now) : 0;

  return {
    ok: true as const,
    punchKioskLocked,
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
    },
    ...status,
    plannedShift: plannedShift
      ? {
          shiftId: plannedShift.id,
          startISO: plannedShift.startTime.toISOString(),
          endISO: plannedShift.endTime.toISOString(),
        }
      : null,
    lateMs,
    isLate: lateMs > 0,
    fetchedAt: now.toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  try {
    const payload = await buildPunchStatePayload(auth.employeeId);
    if ("error" in payload) {
      return NextResponse.json({ ok: false, error: payload.error }, { status: payload.status });
    }
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ ok: false, error: punchPrismaErrorUserMessage(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 10);

  const auth = await requireEmployeeFromKioskOrCodeValue(code);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  try {
    const payload = await buildPunchStatePayload(auth.employeeId);
    if ("error" in payload) {
      return NextResponse.json({ ok: false, error: payload.error }, { status: payload.status });
    }
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ ok: false, error: punchPrismaErrorUserMessage(e) }, { status: 500 });
  }
}
