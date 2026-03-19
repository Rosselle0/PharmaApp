export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { ShiftStatus } from "@prisma/client";

function startOfDayUTC(ymd: string) {
  // Treat `ymd` as local-ish date string; convert to UTC day boundary safely.
  // ymd is YYYY-MM-DD, we create Date at midnight UTC.
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function nextDayUTC(ymd: string) {
  const dt = startOfDayUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt;
}

function diffMinutes(a: Date, b: Date) {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / 60000));
}

function roundUpToNext15Minutes(mins: number) {
  if (!Number.isFinite(mins)) return 0;
  if (mins <= 0) return 0;
  return Math.ceil(mins / 15) * 15;
}

function ymdUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();

    const url = new URL(req.url);
    const from = String(url.searchParams.get("from") ?? "");
    const to = String(url.searchParams.get("to") ?? "");

    const fromYmd = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : ymdUTC(new Date());
    const toYmd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : fromYmd;

    const dayStart = startOfDayUTC(fromYmd);
    const dayEnd = nextDayUTC(toYmd);

    // Keep response scoped to this company (admin can still see multi-company via UI, but API stays strict).
    const companyId = auth.companyId;

    const employees = await prisma.employee.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        department: true,
      },
    });

    const employeeIds = employees.map((e) => e.id);

    // Shift selection: overlap with the requested range.
    const shifts = await prisma.shift.findMany({
      where: {
        status: { in: [ShiftStatus.PLANNED, ShiftStatus.COMPLETED] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
        employee: { companyId },
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        status: true,
        note: true,
      },
    });

    const shiftIds = shifts.map((s) => s.id);

    const relevantAuditActions = [
      "LATE_ACCEPTED",
      "LATE_REJECTED",
      "LATE_REVIEWED", // backward compat
      "OVERTIME_ACCEPTED",
      "OVERTIME_REJECTED",
      "OVERTIME_REVIEWED", // backward compat
      "OVERTIME_ACCEPTED_BY_PHARMACIST",
    ];

    const auditLogs = shiftIds.length
      ? await prisma.auditLog.findMany({
          where: {
            companyId,
            target: { in: shiftIds },
            action: { in: relevantAuditActions },
          },
          orderBy: { createdAt: "desc" },
          select: { target: true, action: true, meta: true },
        })
      : [];

    const lateDecisionByShift = new Map<string, "ACCEPTED" | "REJECTED" | "PENDING">();
    const overtimeDecisionByShift = new Map<string, "ACCEPTED" | "REJECTED" | "ACCEPTED_BY_PHARMACIST" | "PENDING">();
    const pharmacistEmployeeIdByShift = new Map<string, string>();

    for (const l of auditLogs) {
      const sid = l.target;

      const action = l.action;
      if (!lateDecisionByShift.has(sid)) {
        if (action === "LATE_REJECTED") lateDecisionByShift.set(sid, "REJECTED");
        else if (action === "LATE_ACCEPTED" || action === "LATE_REVIEWED") lateDecisionByShift.set(sid, "ACCEPTED");
      }

      if (!overtimeDecisionByShift.has(sid)) {
        if (action === "OVERTIME_ACCEPTED_BY_PHARMACIST") {
          overtimeDecisionByShift.set(sid, "ACCEPTED_BY_PHARMACIST");
          const pharmacistId = (l.meta as any)?.pharmacistEmployeeId;
          if (typeof pharmacistId === "string") pharmacistEmployeeIdByShift.set(sid, pharmacistId);
        } else if (action === "OVERTIME_REJECTED") overtimeDecisionByShift.set(sid, "REJECTED");
        else if (action === "OVERTIME_ACCEPTED" || action === "OVERTIME_REVIEWED") overtimeDecisionByShift.set(sid, "ACCEPTED");
      }
    }

    const punchEvents = shiftIds.length
      ? await prisma.punchEvent.findMany({
          where: { shiftId: { in: shiftIds } },
          orderBy: { at: "asc" },
          select: { id: true, employeeId: true, type: true, at: true, source: true, shiftId: true },
        })
      : [];

    const punchesByShift = new Map<string, typeof punchEvents>();
    for (const p of punchEvents) {
      const arr = punchesByShift.get(p.shiftId!) ?? [];
      arr.push(p);
      punchesByShift.set(p.shiftId!, arr);
    }

    const computedShifts = shifts.map((s) => {
      const punches = punchesByShift.get(s.id) ?? [];

      const inEvents = punches.filter((p) => p.type === "CLOCK_IN");
      const outEvents = punches.filter((p) => p.type === "CLOCK_OUT");

      const firstIn = inEvents.length ? new Date(inEvents[0].at) : null;
      const lastOut = outEvents.length ? new Date(outEvents[outEvents.length - 1].at) : null;

      const missingClockIn = !firstIn;
      const missingClockOut = !lastOut;

      const lateMinutes = firstIn
        ? roundUpToNext15Minutes((firstIn.getTime() - s.startTime.getTime()) / 60000)
        : null;
      // Overtime: no rounding. We compute exact minutes difference to the scheduled end.
      const overtimeMinutes =
        lastOut && lastOut.getTime() > s.endTime.getTime()
          ? Math.max(0, Math.floor((lastOut.getTime() - s.endTime.getTime()) / 60000))
          : lastOut
            ? 0
            : null;

      const lateDecision = lateMinutes && lateMinutes > 0 ? lateDecisionByShift.get(s.id) ?? "PENDING" : null;
      const overtimeDecision = overtimeMinutes && overtimeMinutes > 0 ? overtimeDecisionByShift.get(s.id) ?? "PENDING" : null;

      const lateStatus = missingClockIn
        ? "MISSING"
        : lateMinutes && lateMinutes > 0
          ? lateDecision ?? "PENDING"
          : "OK";

      const pharmacistEmployeeId = pharmacistEmployeeIdByShift.get(s.id) ?? null;
      const overtimeStatus = missingClockOut
        ? "MISSING"
        : overtimeMinutes && overtimeMinutes > 0
          ? overtimeDecision ?? "PENDING"
          : "OK";

      return {
        id: s.id,
        employeeId: s.employeeId,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        note: s.note,
        status: s.status,
        lateMinutes: lateMinutes === 0 ? 0 : lateMinutes,
        overtimeMinutes: overtimeMinutes === 0 ? 0 : overtimeMinutes,
        missingClockIn,
        missingClockOut,
        lateStatus,
        overtimeStatus,
        pharmacistEmployeeId,
        punches: punches.map((p) => ({
          id: p.id,
          employeeId: p.employeeId,
          type: p.type,
          at: p.at.toISOString(),
          source: p.source,
        })),
      } as {
        id: string;
        employeeId: string;
        startTime: string;
        endTime: string;
        note: string | null;
        status: string;
        lateMinutes: number | null;
        overtimeMinutes: number | null;
        missingClockIn: boolean;
        missingClockOut: boolean;
        lateStatus: "MISSING" | "OK" | "ACCEPTED" | "REJECTED" | "PENDING";
        overtimeStatus: "MISSING" | "OK" | "ACCEPTED" | "REJECTED" | "ACCEPTED_BY_PHARMACIST" | "PENDING";
        pharmacistEmployeeId: string | null;
        punches: Array<{ id: string; employeeId: string; type: any; at: string; source: any }>;
      };
    });

    const availabilityRules = employeeIds.length
      ? await prisma.availabilityRule.findMany({
          where: { employeeId: { in: employeeIds } },
          select: {
            employeeId: true,
            dayOfWeek: true,
            available: true,
            startHHMM: true,
            endHHMM: true,
            note: true,
          },
        })
      : [];

    const shiftChangeRequests = shiftIds.length
      ? await prisma.shiftChangeRequest.findMany({
          where: {
            companyId,
            shiftId: { in: shiftIds },
            status: { in: ["ACCEPTED", "REJECTED", "CANCELLED"] },
          },
          orderBy: { decidedAt: "desc" },
          select: {
            id: true,
            status: true,
            decidedAt: true,
            message: true,
            shift: { select: { id: true, startTime: true, endTime: true, note: true } },
            requesterEmployee: {
              select: { id: true, firstName: true, lastName: true, department: true },
            },
            candidateEmployee: {
              select: { id: true, firstName: true, lastName: true, department: true },
            },
          },
        })
      : [];

    const taskAssignments = employeeIds.length
      ? await prisma.taskAssignment.findMany({
          where: {
            companyId,
            employeeId: { in: employeeIds },
            date: { gte: dayStart, lt: dayEnd },
          },
          orderBy: { date: "desc" },
          select: {
            id: true,
            employeeId: true,
            date: true,
            title: true,
            notes: true,
            items: { select: { id: true, text: true, required: true, done: true } },
          },
        })
      : [];

    const meta = {
      shiftsCount: computedShifts.length,
      punchesCount: punchEvents.length,
      lateShiftsCount: computedShifts.filter((s) => s.lateStatus === "ACCEPTED").length,
      overtimeShiftsCount: computedShifts.filter((s) => s.overtimeStatus === "ACCEPTED" || s.overtimeStatus === "ACCEPTED_BY_PHARMACIST").length,
    };

    return NextResponse.json({
      ok: true,
      from: fromYmd,
      to: toYmd,
      employees,
      availabilityRules,
      shifts: computedShifts,
      shiftChangeRequests,
      taskAssignments: taskAssignments.map((a) => ({
        id: a.id,
        employeeId: a.employeeId,
        date: a.date.toISOString(),
        title: a.title,
        notes: a.notes,
        items: a.items.map((it) => ({
          id: it.id,
          text: it.text,
          required: it.required,
          done: it.done,
        })),
      })),
      meta,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Admin logs failed" }, { status: 500 });
  }
}

