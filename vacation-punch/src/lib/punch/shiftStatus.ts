import { prisma } from "@/lib/prisma";

export type PunchType =
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | "LUNCH_START"
  | "LUNCH_END";

export type PunchState = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

export type PunchHistoryRow = {
  type: PunchType;
  at: Date;
  shiftId?: string | null;
  id?: string;
};

/** Open shift longer than this is treated as stale (allows new clock-in). */
export const OPEN_SHIFT_MAX_MS = 18 * 60 * 60 * 1000;

const HISTORY_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000;

function diffMs(a: Date, b: Date) {
  return Math.max(0, a.getTime() - b.getTime());
}

export function sliceEventsSinceLastClockOut<T extends { type: string; at: Date }>(events: T[]): T[] {
  let lastOutIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "CLOCK_OUT") {
      lastOutIdx = i;
      break;
    }
  }
  return lastOutIdx >= 0 ? events.slice(lastOutIdx + 1) : events;
}

export function computeShiftStatus(events: PunchHistoryRow[], now = new Date()) {
  const sessionEvents = sliceEventsSinceLastClockOut(events);

  let state: PunchState = "OUT";
  let shiftStart: Date | null = null;
  let activeStartedAt: Date | null = null;
  let breakDone = false;
  let lunchDone = false;
  let breakMs = 0;
  let lunchMs = 0;

  for (const event of sessionEvents) {
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

  let staleSession = false;
  if (state !== "OUT" && shiftStart && now.getTime() - shiftStart.getTime() > OPEN_SHIFT_MAX_MS) {
    staleSession = true;
    state = "OUT";
    shiftStart = null;
    activeStartedAt = null;
    breakDone = false;
    lunchDone = false;
    breakMs = 0;
    lunchMs = 0;
  }

  let workMs = 0;
  if (shiftStart) {
    const runningEnd = state === "IN" ? now : activeStartedAt ?? now;
    workMs = Math.max(0, diffMs(runningEnd, shiftStart) - breakMs - lunchMs);
  }

  const liveBreakMs = state === "ON_BREAK" && activeStartedAt ? breakMs + diffMs(now, activeStartedAt) : breakMs;
  const liveLunchMs = state === "ON_LUNCH" && activeStartedAt ? lunchMs + diffMs(now, activeStartedAt) : lunchMs;

  const lastClockIn = [...sessionEvents].reverse().find((e) => e.type === "CLOCK_IN");

  return {
    state,
    breakDone,
    lunchDone,
    workMs,
    breakMs: liveBreakMs,
    lunchMs: liveLunchMs,
    staleSession,
    lastClockInShiftId: lastClockIn?.shiftId ?? null,
    sessionOpen: state !== "OUT",
  };
}

/** Same history window for kiosk state + punch actions (avoids 7d vs all-time mismatch). */
export async function fetchEmployeePunchHistory(employeeId: string) {
  const lastOut = await prisma.punchEvent.findFirst({
    where: { employeeId, type: "CLOCK_OUT" },
    orderBy: { at: "desc" },
    select: { at: true },
  });

  const since = lastOut?.at ?? new Date(Date.now() - HISTORY_FALLBACK_MS);

  return prisma.punchEvent.findMany({
    where: { employeeId, at: { gte: since } },
    orderBy: { at: "asc" },
    select: { id: true, type: true, at: true, shiftId: true },
  });
}

/** True when employee still has IN/BREAK/LUNCH without a matching admin-close. */
export async function employeeHasOpenPunchSession(employeeId: string, now = new Date()) {
  const history = await fetchEmployeePunchHistory(employeeId);
  const status = computeShiftStatus(
    history.map((h) => ({ type: h.type as PunchType, at: h.at, shiftId: h.shiftId })),
    now
  );
  return {
    sessionOpen: status.sessionOpen,
    staleSession: status.staleSession,
    state: status.state,
    lastClockInShiftId: status.lastClockInShiftId,
  };
}
