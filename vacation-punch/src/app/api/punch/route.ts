export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode, requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";
import { requireTerminalOrDev } from "@/lib/punch/terminalGuard";

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

  if (!isPunchType(type)) {
    return NextResponse.json({ ok: false, error: "Type de punch invalide" }, { status: 400 });
  }

  const history = await prisma.punchEvent.findMany({
    where: { employeeId: auth.employeeId },
    orderBy: { at: "asc" },
    select: { type: true, at: true },
  });

  const status = getShiftStatus(history as Array<{ type: PunchType; at: Date }>);

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

  const now = new Date();

  await prisma.punchEvent.create({
    data: {
      employeeId: auth.employeeId,
      type,
      at: now,
      source: terminal.dev ? "WEB" : "WEB",
    },
  });

  const nextStatus = getShiftStatus([...history as Array<{ type: PunchType; at: Date }>, { type, at: now }], now);

  return NextResponse.json({
    ok: true,
    ...nextStatus,
    punchedAt: now.toISOString(),
  });
}
