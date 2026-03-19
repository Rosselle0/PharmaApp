export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode, requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";
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

function roundToNearest0or5(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const nearest = Math.round(mins / 5) * 5;
  x.setMinutes(Math.min(59, Math.max(0, nearest)));
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

type PunchType = (typeof PunchTypes)[number];
type PunchState = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

function isPunchType(x: unknown): x is PunchType {
  return typeof x === "string" && (PunchTypes as readonly string[]).includes(x);
}

function diffMs(a: Date, b: Date) {
  return Math.max(0, a.getTime() - b.getTime());
}

function getShiftStatus(events: Array<{ type: PunchType; at: Date }>, now = new Date()) {
  let state: PunchState = "OUT";
  let shiftStart: Date | null = null;
  let activeStartedAt: Date | null = null;
  let breakDone = false;
  let lunchDone = false;
  let breakMs = 0;
  let lunchMs = 0;

  for (const event of events) {
    switch (event.type) {
      case "CLOCK_IN":
        state = "IN";
        shiftStart = event.at;
        activeStartedAt = null;
        breakDone = false;
        lunchDone = false;
        breakMs = 0;
        lunchMs = 0;
        break;
      case "BREAK_START":
        if (shiftStart && state === "IN" && !breakDone) {
          state = "ON_BREAK";
          activeStartedAt = event.at;
        }
        break;
      case "BREAK_END":
        if (shiftStart && state === "ON_BREAK" && activeStartedAt) {
          breakMs += diffMs(event.at, activeStartedAt);
          breakDone = true;
          state = "IN";
          activeStartedAt = null;
        }
        break;
      case "LUNCH_START":
        if (shiftStart && state === "IN" && !lunchDone) {
          state = "ON_LUNCH";
          activeStartedAt = event.at;
        }
        break;
      case "LUNCH_END":
        if (shiftStart && state === "ON_LUNCH" && activeStartedAt) {
          lunchMs += diffMs(event.at, activeStartedAt);
          lunchDone = true;
          state = "IN";
          activeStartedAt = null;
        }
        break;
      case "CLOCK_OUT":
        state = "OUT";
        shiftStart = null;
        activeStartedAt = null;
        breakDone = false;
        lunchDone = false;
        breakMs = 0;
        lunchMs = 0;
        break;
    }
  }

  let workMs = 0;
  if (shiftStart) {
    const runningEnd = state === "IN" ? now : activeStartedAt ?? now;
    workMs = Math.max(0, diffMs(runningEnd, shiftStart) - breakMs - lunchMs);
  }

  const liveBreakMs = state === "ON_BREAK" && activeStartedAt ? breakMs + diffMs(now, activeStartedAt) : breakMs;
  const liveLunchMs = state === "ON_LUNCH" && activeStartedAt ? lunchMs + diffMs(now, activeStartedAt) : lunchMs;

  return {
    state,
    breakDone,
    lunchDone,
    workMs,
    breakMs: liveBreakMs,
    lunchMs: liveLunchMs,
  };
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

  if (!isPunchType(type)) {
    return NextResponse.json({ ok: false, error: "Type de punch invalide" }, { status: 400 });
  }

  const now = new Date();
  const nowYmd = ymdInTZ(now);
  const nowTime = now.getTime();

  const history = await prisma.punchEvent.findMany({
    where: { employeeId },
    orderBy: { at: "asc" },
    select: { type: true, at: true, shiftId: true },
  });

  const status = getShiftStatus(history as Array<{ type: PunchType; at: Date }>);

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
      { ok: false, error: `Action non permise dans l'état: ${status.state}` },
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
        startDate: { lte: now },
        endDate: { gte: now },
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
      const toleranceBeforeMs = 2 * 60 * 60 * 1000;
      const toleranceAfterMs = type === "CLOCK_IN" ? 12 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;

      let best: { id: string; score: number } | null = null;
      for (const s of sameDay) {
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
    }

    // No planned shift: auto-create one on CLOCK_IN/CLOCK_OUT so schedule can display it.
    const availableRule = await prisma.availabilityRule.findFirst({
      where: { employeeId, dayOfWeek: dayOfWeekInTZ(now) },
      select: { available: true },
    });
    const isAvailable = Boolean(availableRule?.available);
    const autoNote = isAvailable ? "PUNCH_AUTO" : "PUNCH_AUTO_UNAVAILABLE";

    if (type === "CLOCK_IN") {
      const shiftStart = roundUpToNext15Minutes(now);
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
    const shiftEnd = roundToNearest0or5(now);
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
      at: now,
      source: terminal.dev ? "WEB" : "WEB",
      shiftId: type === "BREAK_START" || type === "BREAK_END" || type === "LUNCH_START" || type === "LUNCH_END" ? lastClockInWithShiftId : chosenShiftId,
    },
  });

  // If this was an auto-created shift, update its endTime on CLOCK_OUT so schedule shows the real range.
  if (type === "CLOCK_OUT" && isAuto && chosenShiftId) {
    const end = roundToNearest0or5(now);
    await prisma.shift.update({
      where: { id: chosenShiftId },
      data: { endTime: end },
    });
  }

  const nextStatus = getShiftStatus([...history as Array<{ type: PunchType; at: Date }>, { type, at: now }], now);

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
    punchedAt: now.toISOString(),
    overtime,
  });
}
