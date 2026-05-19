import { isAutoPunchShift } from "@/lib/punch/shiftNotes";

export type ShiftDisplayRow = {
  id: string;
  employeeId: string;
  startTime: string | Date;
  endTime: string | Date;
  note: string | null;
  punchInAt?: string | Date | null;
};

export function collapseShiftsForDisplay<T extends ShiftDisplayRow>(list: T[]): T[] {
  const rows = list.filter((s) => !isAutoPunchShift(s.note));
  const pool = rows.length ? rows : list;
  if (pool.length <= 1) return pool;

  const manual = pool.filter((s) => !isAutoPunchShift(s.note));
  const basePool = manual.length ? manual : pool;
  const primary = [...basePool].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )[0];

  const punchInAt =
    pool.map((s) => (s.punchInAt ? new Date(s.punchInAt) : null)).find((t): t is Date => t instanceof Date) ??
    null;

  if (!punchInAt) return [primary];

  return [{ ...primary, punchInAt: punchInAt.toISOString() }];
}

export function shiftDisplayTimes(sh: ShiftDisplayRow) {
  const start = sh.punchInAt ? new Date(sh.punchInAt) : new Date(sh.startTime);
  const end = new Date(sh.endTime);
  return { start, end };
}

export function shouldShowShiftNote(note: string | null | undefined) {
  if (!note || note === "VAC") return false;
  if (isAutoPunchShift(note)) return false;
  return true;
}

/** Attach first CLOCK_IN per shift (same window rules as schedule view). */
export function buildPunchInByShiftId(
  shifts: { id: string; employeeId: string; startTime: Date }[],
  punchIns: { employeeId: string; shiftId: string | null; at: Date }[]
) {
  const punchInByShiftId = new Map<string, Date>();
  const punchInByEmployee = new Map<string, Date[]>();

  for (const p of punchIns) {
    if (p.shiftId && !punchInByShiftId.has(p.shiftId)) punchInByShiftId.set(p.shiftId, p.at);
    const arr = punchInByEmployee.get(p.employeeId) ?? [];
    arr.push(p.at);
    punchInByEmployee.set(p.employeeId, arr);
  }

  for (const s of shifts) {
    const startMs = s.startTime.getTime();
    let firstIn = punchInByShiftId.get(s.id);
    if (!firstIn) {
      const arr = punchInByEmployee.get(s.employeeId) ?? [];
      const toleranceBeforeMs = 2 * 60 * 60 * 1000;
      const toleranceAfterMs = 12 * 60 * 60 * 1000;
      const candidates = arr.filter((at) => {
        const t = at.getTime();
        return t >= startMs - toleranceBeforeMs && t <= startMs + toleranceAfterMs;
      });
      firstIn = candidates.length ? candidates[0] : undefined;
    }
    if (firstIn) punchInByShiftId.set(s.id, firstIn);
  }

  return punchInByShiftId;
}
