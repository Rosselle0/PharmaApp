import { ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ymdInTZ } from "@/lib/shiftChange/time";

function isVacNote(note: string | null | undefined) {
  return String(note ?? "").toUpperCase().includes("VAC");
}

/** Best planned shift for kiosk late display / clock-in matching (today in APP_TZ). */
export async function findTodayShiftForEmployee(employeeId: string, now = new Date()) {
  const nowYmd = ymdInTZ(now);
  const nowTime = now.getTime();
  const toleranceBeforeMs = 2 * 60 * 60 * 1000;
  const toleranceAfterMs = 12 * 60 * 60 * 1000;

  const windowStart = new Date(nowTime - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(nowTime + 24 * 60 * 60 * 1000);

  const candidates = await prisma.shift.findMany({
    where: {
      employeeId,
      status: { in: [ShiftStatus.PLANNED, ShiftStatus.COMPLETED] },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, startTime: true, endTime: true, note: true },
    orderBy: { startTime: "asc" },
  });

  const sameDay = candidates.filter((s) => ymdInTZ(s.startTime) === nowYmd && !isVacNote(s.note));
  if (!sameDay.length) return null;

  let best: (typeof sameDay)[number] | null = null;
  let bestScore = Infinity;
  for (const s of sameDay) {
    const startMs = s.startTime.getTime();
    const minAllowed = startMs - toleranceBeforeMs;
    const maxAllowed = startMs + toleranceAfterMs;
    if (nowTime < minAllowed || nowTime > maxAllowed) continue;
    const score = Math.abs(nowTime - startMs);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best) return best;

  return [...sameDay].sort(
    (a, b) => Math.abs(nowTime - a.startTime.getTime()) - Math.abs(nowTime - b.startTime.getTime())
  )[0];
}
