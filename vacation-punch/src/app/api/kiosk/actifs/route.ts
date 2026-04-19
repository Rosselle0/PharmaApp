export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messageFromUnknown } from "@/lib/unknownError";

type PunchType =
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | "LUNCH_START"
  | "LUNCH_END";
type UiState = "WORKING" | "BREAK" | "LUNCH" | "LEFT";
type PunchState = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

function diffMs(a: Date, b: Date) {
  return Math.max(0, a.getTime() - b.getTime());
}

function getShiftStatus(events: Array<{ type: PunchType; at: Date }>, now = new Date()) {
  let state: PunchState = "OUT";
  let shiftStart: Date | null = null;
  let activeStartedAt: Date | null = null;
  let breakMs = 0;
  let lunchMs = 0;

  for (const event of events) {
    switch (event.type) {
      case "CLOCK_IN":
        state = "IN";
        shiftStart = event.at;
        activeStartedAt = null;
        breakMs = 0;
        lunchMs = 0;
        break;
      case "BREAK_START":
        if (shiftStart && state === "IN") {
          state = "ON_BREAK";
          activeStartedAt = event.at;
        }
        break;
      case "BREAK_END":
        if (shiftStart && state === "ON_BREAK" && activeStartedAt) {
          breakMs += diffMs(event.at, activeStartedAt);
          state = "IN";
          activeStartedAt = null;
        }
        break;
      case "LUNCH_START":
        if (shiftStart && state === "IN") {
          state = "ON_LUNCH";
          activeStartedAt = event.at;
        }
        break;
      case "LUNCH_END":
        if (shiftStart && state === "ON_LUNCH" && activeStartedAt) {
          lunchMs += diffMs(event.at, activeStartedAt);
          state = "IN";
          activeStartedAt = null;
        }
        break;
      case "CLOCK_OUT":
        state = "OUT";
        shiftStart = null;
        activeStartedAt = null;
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

  return { state, workMs, breakMs: liveBreakMs, lunchMs: liveLunchMs };
}

function toUiState(state: PunchState): UiState {
  if (state === "IN") return "WORKING";
  if (state === "ON_BREAK") return "BREAK";
  if (state === "ON_LUNCH") return "LUNCH";
  return "LEFT";
}

export async function GET(req: Request) {
  // Vercel-side memory cache (per instance) to reduce DB load.
  // Kiosk UI polls frequently; caching prevents connection storms.
  const g = globalThis as unknown as {
    __actifsCache?: { ts: number; data: unknown };
  };
  const nowMs = Date.now();
  const TTL_MS = 8000;
  if (g.__actifsCache && nowMs - g.__actifsCache.ts < TTL_MS) {
    return NextResponse.json(g.__actifsCache.data);
  }

  const url = new URL(req.url);
  const rawCode = String(url.searchParams.get("code") ?? "");
  const code = rawCode.replace(/\D/g, "").slice(0, 10);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

  // Avoid relation filters in `where` to prevent Prisma runtime validation issues on Vercel.
  const employees =
    code && code.length >= 4
      ? await prisma.employee.findMany({
          where: { employeeCode: code, isActive: true },
          select: { id: true, firstName: true, lastName: true },
          take: 1,
        })
      : await prisma.employee.findMany({
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true },
        });

  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return NextResponse.json({ ok: true, actifs: [] });

  try {
    const rows = await prisma.punchEvent.findMany({
    where: {
      at: { gte: since },
      employeeId: { in: employeeIds },
    },
    orderBy: { at: "asc" },
    select: {
      employeeId: true,
      type: true,
      at: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
    });

  const byEmployee = new Map<string, { name: string; events: Array<{ type: PunchType; at: Date }> }>();

  for (const row of rows) {
    const current = byEmployee.get(row.employeeId) ?? {
      name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      events: [],
    };
    current.events.push({ type: row.type as PunchType, at: row.at });
    byEmployee.set(row.employeeId, current);
  }

  const now = new Date();
  const actifs = Array.from(byEmployee.entries())
    .map(([employeeId, value]) => {
      const status = getShiftStatus(value.events, now);
      const state = toUiState(status.state);
      const minutes = Math.floor(
        (status.state === "IN"
          ? status.workMs
          : status.state === "ON_BREAK"
          ? status.breakMs
          : status.state === "ON_LUNCH"
          ? status.lunchMs
          : 0) / 60000
      );
      return {
        employeeId,
        name: value.name,
        state,
        minutes,
      };
    })
    .filter((row) => row.state !== "LEFT")
    .sort((a, b) => a.name.localeCompare(b.name));

    const result = { ok: true, actifs };
    g.__actifsCache = { ts: nowMs, data: result };
    return NextResponse.json(result);
  } catch (e: unknown) {
    // If DB is temporarily overloaded, serve last cached value if available.
    if (g.__actifsCache?.data) {
      return NextResponse.json(g.__actifsCache.data);
    }
    return NextResponse.json(
      { ok: false, error: messageFromUnknown(e) || "Erreur actives" },
      { status: 500 }
    );
  }
}
