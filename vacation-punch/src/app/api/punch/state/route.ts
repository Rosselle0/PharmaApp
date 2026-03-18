export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";

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

export async function GET(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: auth.employeeId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  });

  if (!employee) {
    return NextResponse.json({ ok: false, error: "Employé introuvable" }, { status: 404 });
  }

  const since = new Date(Date.now() - 72 * 60 * 60 * 1000); // last 72 hours
  const history = await prisma.punchEvent.findMany({
    where: { employeeId: auth.employeeId, at: { gte: since } },
    orderBy: { at: "asc" },
    select: { type: true, at: true },
  });

  const status = getShiftStatus(history as Array<{ type: PunchType; at: Date }>);

  return NextResponse.json({
    ok: true,
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      code: employee.employeeCode,
    },
    ...status,
    fetchedAt: new Date().toISOString(),
  });
}
