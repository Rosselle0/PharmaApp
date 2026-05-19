export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma, punchPrismaErrorUserMessage } from "@/lib/prisma";
import { resolvePunchKioskLocked } from "@/lib/punch/kioskLockDay";
import { requireEmployeeFromKioskOrCode, requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";
import { isAutoPunchShift } from "@/lib/punch/shiftNotes";
import {
  computeShiftStatus,
  fetchEmployeePunchHistory,
  type PunchType,
} from "@/lib/punch/shiftStatus";
import { requireTerminalOrDev } from "@/lib/punch/terminalGuard";
import { ShiftStatus, VacationStatus } from "@prisma/client";

const TZ = process.env.APP_TZ || "America/Toronto";

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
}

function dayOfWeekInTZ(d: Date) {
  // Create a UTC date at local YMD noon, then read its UTC day-of-week.
  const ymd = ymdInTZ(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  return dt.getUTCDay(); // 0=Sun..6=Sat
}

function roundUpToNext15Minutes(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const next = Math.ceil(mins / 15) * 15;
  if (next === 60) {
    x.setHours(x.getHours() + 1);
    x.setMinutes(0);
  } else {
    x.setMinutes(next);
  }
  return x;
}

function roundDownTo15Minutes(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const prev = Math.floor(mins / 15) * 15;
  x.setMinutes(Math.max(0, prev));
  return x;
}

function roundToNearest15Minutes(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const nearest = Math.round(mins / 15) * 15;
  if (nearest === 60) {
    x.setHours(x.getHours() + 1);
    x.setMinutes(0);
  } else {
    x.setMinutes(Math.max(0, nearest));
  }
  return x;
}

const PunchTypes = [
  "CLOCK_IN",
  "CLOCK_OUT",
  "BREAK_START",
  "BREAK_END",
  "LUNCH_START",
  "LUNCH_END",
] as const;

type PunchState = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

function isPunchType(x: unknown): x is PunchType {
  return typeof x === "string" && (PunchTypes as readonly string[]).includes(x);
}

export async function POST(req: Request) {
  const terminal = await requireTerminalOrDev(req);
  if (!terminal.ok) return NextResponse.json({ ok: false, error: terminal.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 10);

  const auth =
    code.length > 0 ? await requireEmployeeFromKioskOrCodeValue(code) : await requireEmployeeFromKioskOrCode(req);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const employeeId = auth.employeeId;

  try {
  const empRow = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { punchKioskLocked: true },
  });
  if (!isPunchType(type)) {
    return NextResponse.json({ ok: false, error: "Type de punch invalide" }, { status: 400 });
  }
  const now = new Date();
  const punchAt =
    type === "CLOCK_IN"
      ? roundDownTo15Minutes(now) // never future, prevents break/lunch ordering bugs
      : type === "CLOCK_OUT"
      ? roundToNearest15Minutes(now)
      : now;
  const kioskLocked = await resolvePunchKioskLocked(employeeId, Boolean(empRow?.punchKioskLocked), punchAt);
  if (kioskLocked) {
    return NextResponse.json(
      {
        ok: false,
        punchLocked: true,
        error:
          "Pointage verrouillé après votre sortie jusqu’au lendemain (après minuit) ou le responsable peut déverrouiller depuis les Journaux (double quart le même jour).",
      },
      { status: 403 }
    );
  }

  const nowYmd = ymdInTZ(punchAt);
  const nowTime = punchAt.getTime();

  const history = await fetchEmployeePunchHistory(employeeId);

  const status = computeShiftStatus(
    history.map((h) => ({ type: h.type as PunchType, at: h.at, shiftId: h.shiftId })),
    punchAt
  );

  // Determine active shift (for BREAK/LUNCH punches). We only reliably attach shiftId to CLOCK_IN/CLOCK_OUT.
  const lastClockInWithShiftId =
    [...history].reverse().find((h) => h.type === "CLOCK_IN" && h.shiftId)?.shiftId ?? null;

  const allowed: Record<PunchState, PunchType[]> = {
    OUT: ["CLOCK_IN"],
    IN: [
      ...(status.breakDone ? ([] as PunchType[]) : (["BREAK_START"] as PunchType[])),
      ...(status.lunchDone ? ([] as PunchType[]) : (["LUNCH_START"] as PunchType[])),
      "CLOCK_OUT",
    ],
    ON_BREAK: ["BREAK_END"],
    ON_LUNCH: ["LUNCH_END"],
  };

  if (!allowed[status.state].includes(type)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Action non permise dans l'état: ${status.state}`,
        serverState: status.state,
        staleSession: status.staleSession,
      },
      { status: 409 }
    );
  }

  // Vacation check: if the employee has a VAC shift on this local day, block any punch.
    // Also block if there's an active VacationRequest (PENDING or APPROVED) overlapping "now",
    // to prevent auto-created shifts that later cause admin conflicts.
    const vacReq = await prisma.vacationRequest.findFirst({
      where: {
        employeeId,
        status: { in: [VacationStatus.PENDING, VacationStatus.APPROVED] },
        startDate: { lte: punchAt },
        endDate: { gte: punchAt },
      },
      select: { id: true },
    });

    if (vacReq) {
      return NextResponse.json({ ok: false, error: "Employé en vacances (punch bloqué)." }, { status: 403 });
    }

    const vacShift = await prisma.shift.findFirst({
      where: {
        employeeId,
        status: { in: [ShiftStatus.PLANNED, ShiftStatus.COMPLETED] },
        // In this codebase, vacation shifts are stored with note="VAC".
        note: { contains: "VAC" },
        startTime: { lte: new Date(nowTime + 36 * 3600 * 1000) },
        endTime: { gte: new Date(nowTime - 36 * 3600 * 1000) },
      },
      select: { id: true, startTime: true },
    });

    if (vacShift && ymdInTZ(vacShift.startTime) === nowYmd) {
      return NextResponse.json(
        { ok: false, error: "Employé en vacances (punch bloqué)." },
        { status: 403 }
      );
    }
  

  async function pickShiftForPunch(): Promise<{ shiftId: string | null; isAuto: boolean; autoNote: string | null }> {
    // For CLOCK_OUT, always prefer the exact shift used at last CLOCK_IN.
    // This avoids picking a duplicate/overwritten shift with a different end time.
    if (type === "CLOCK_OUT" && lastClockInWithShiftId) {
      const linked = await prisma.shift.findUnique({
        where: { id: lastClockInWithShiftId },
        select: { id: true, startTime: true, note: true },
      });
      if (linked && ymdInTZ(linked.startTime) === nowYmd) {
        return {
          shiftId: linked.id,
          isAuto: isAutoPunchShift(linked.note),
          autoNote: isAutoPunchShift(linked.note) ? linked.note ?? null : null,
        };
      }
    }

    const windowStart = new Date(nowTime - 10 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(nowTime + 2 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.shift.findMany({
      where: {
        employeeId,
        status: { in: [ShiftStatus.PLANNED, ShiftStatus.COMPLETED] },
        startTime: { gte: windowStart, lte: windowEnd },
        note: { not: { contains: "VAC" } },
      },
      select: { id: true, startTime: true, endTime: true, note: true },
    });

    const sameDay = candidates.filter((s) => ymdInTZ(s.startTime) === nowYmd);
    if (sameDay.length) {
      const manualSameDay = sameDay.filter((s) => !isAutoPunchShift(s.note));
      const matchPool = manualSameDay.length ? manualSameDay : sameDay;

      const toleranceBeforeMs = 2 * 60 * 60 * 1000;
      const toleranceAfterMs = type === "CLOCK_IN" ? 12 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;

      let best: { id: string; score: number } | null = null;
      for (const s of matchPool) {
        const startMs = s.startTime.getTime();
        const endMs = s.endTime.getTime();
        const minAllowed = type === "CLOCK_IN" ? startMs - toleranceBeforeMs : endMs - toleranceBeforeMs;
        const maxAllowed = type === "CLOCK_IN" ? startMs + toleranceAfterMs : endMs + toleranceAfterMs;
        if (nowTime < minAllowed || nowTime > maxAllowed) continue;

        const target = type === "CLOCK_IN" ? startMs : endMs;
        const score = Math.abs(nowTime - target);
        if (!best || score < best.score) best = { id: s.id, score };
      }
      if (best) return { shiftId: best.id, isAuto: false, autoNote: null };

      // Important fallback:
      // if a planned shift exists on the same day but is outside tolerance,
      // still attach to the nearest same-day shift instead of auto-creating.
      const nearestSameDay = [...matchPool]
        .sort((a, b) => {
          const targetA = type === "CLOCK_IN" ? a.startTime.getTime() : a.endTime.getTime();
          const targetB = type === "CLOCK_IN" ? b.startTime.getTime() : b.endTime.getTime();
          return Math.abs(nowTime - targetA) - Math.abs(nowTime - targetB);
        })[0];
      if (nearestSameDay) {
        return {
          shiftId: nearestSameDay.id,
          isAuto: isAutoPunchShift(nearestSameDay.note),
          autoNote: isAutoPunchShift(nearestSameDay.note) ? nearestSameDay.note ?? null : null,
        };
      }
    }

    // No planned shift: auto-create only when nothing exists on this day.
    const availableRule = await prisma.availabilityRule.findFirst({
      where: { employeeId, dayOfWeek: dayOfWeekInTZ(punchAt) },
      select: { available: true },
    });
    const isAvailable = Boolean(availableRule?.available);
    const autoNote = isAvailable ? "PUNCH_AUTO" : "PUNCH_AUTO_UNAVAILABLE";

    if (type === "CLOCK_IN") {
      const shiftStart = roundUpToNext15Minutes(punchAt);
      const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
      const created = await prisma.shift.create({
        data: {
          employeeId,
          startTime: shiftStart,
          endTime: shiftEnd,
          note: autoNote,
          status: ShiftStatus.PLANNED,
          source: "MANUAL",
        },
        select: { id: true },
      });
      return { shiftId: created.id, isAuto: true, autoNote };
    }

    // If someone tries CLOCK_OUT without an existing planned shift, still create a minimal shift.
    const createdStart = new Date(nowTime - 8 * 60 * 60 * 1000);
    const shiftStart = roundUpToNext15Minutes(createdStart);
    const shiftEnd = roundToNearest15Minutes(punchAt);
    const created = await prisma.shift.create({
      data: {
        employeeId,
        startTime: shiftStart,
        endTime: shiftEnd,
        note: autoNote,
        status: ShiftStatus.PLANNED,
        source: "MANUAL",
      },
      select: { id: true },
    });
    return { shiftId: created.id, isAuto: true, autoNote };
  }

  // Only create/match shifts on CLOCK_IN/CLOCK_OUT.
  let chosenShiftId: string | null = null;
  let isAuto = false;
  if (type === "CLOCK_IN" || type === "CLOCK_OUT") {
    const picked = await pickShiftForPunch();
    chosenShiftId = picked.shiftId;
    isAuto = picked.isAuto;
  } else {
    chosenShiftId = lastClockInWithShiftId;
  }

  await prisma.punchEvent.create({
    data: {
      employeeId,
      type,
      at: punchAt,
      source: terminal.dev ? "WEB" : "WEB",
      shiftId: type === "BREAK_START" || type === "BREAK_END" || type === "LUNCH_START" || type === "LUNCH_END" ? lastClockInWithShiftId : chosenShiftId,
    },
  });

  if (type === "CLOCK_OUT") {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { punchKioskLocked: true },
    });
  }

  const nextStatus = computeShiftStatus(
    [
      ...history.map((h) => ({ type: h.type as PunchType, at: h.at, shiftId: h.shiftId })),
      { type, at: punchAt, shiftId: null },
    ],
    punchAt
  );

  // Overtime popup triggered when CLOCK_OUT is after the planned shift end.
  let overtime: { shiftId: string; overtimeMinutes: number } | null = null;
  if (type === "CLOCK_OUT" && chosenShiftId && !isAuto) {
    const shift = await prisma.shift.findUnique({
      where: { id: chosenShiftId },
      select: { endTime: true, note: true },
    });
    if (shift) {
      const overtimeMinutes = Math.max(0, Math.floor((nowTime - shift.endTime.getTime()) / 60000));
      if (overtimeMinutes > 0) overtime = { shiftId: chosenShiftId, overtimeMinutes };
    }
  }

  return NextResponse.json({
    ok: true,
    ...nextStatus,
    punchedAt: punchAt.toISOString(),
    overtime,
  });
  } catch (e) {
    return NextResponse.json({ ok: false, error: punchPrismaErrorUserMessage(e) }, { status: 500 });
  }
}
