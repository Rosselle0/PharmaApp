import { isAutoPunchShift } from "@/lib/punch/shiftNotes";
import { employeeDayKey, shiftHasClockIn } from "@/lib/punch/attendanceReview";

export type PunchEventLite = {
  id: string;
  employeeId: string;
  type: string;
  at: Date;
  source: string;
  shiftId: string | null;
};

export type ShiftForLinking = {
  id: string;
  employeeId: string;
  startTime: Date;
  endTime: Date;
  note: string | null;
};

/** Prefer planned shifts over auto-created when matching punches. */
export function autoShiftMatchBias(note: string | null | undefined) {
  return isAutoPunchShift(note) ? 1_000_000 : 0;
}

/**
 * If punch landed on an auto shift but a planned shift exists the same day without
 * a clock-in, copy punch events onto the planned shift for logs / lateness.
 */
export function mergeOrphanPunchesOntoPlannedShifts<T extends PunchEventLite>(
  shifts: ShiftForLinking[],
  punchesByShift: Map<string, T[]>
) {
  const byDay = new Map<string, ShiftForLinking[]>();
  for (const sh of shifts) {
    const key = employeeDayKey(sh.employeeId, sh.startTime);
    const arr = byDay.get(key) ?? [];
    arr.push(sh);
    byDay.set(key, arr);
  }

  for (const dayShifts of byDay.values()) {
    const planned = dayShifts.filter((s) => !isAutoPunchShift(s.note) && s.note !== "VAC");
    const auto = dayShifts.filter((s) => isAutoPunchShift(s.note));
    if (!planned.length || !auto.length) continue;

    for (const manual of planned) {
      const manualPunches = punchesByShift.get(manual.id) ?? [];
      if (shiftHasClockIn(manualPunches)) continue;

      for (const autoShift of auto) {
        const autoPunches = punchesByShift.get(autoShift.id) ?? [];
        if (!shiftHasClockIn(autoPunches)) continue;
        punchesByShift.set(manual.id, [...manualPunches, ...autoPunches]);
        punchesByShift.set(autoShift.id, []);
        break;
      }
    }
  }
}

/** Hide auto-created rows in journaux when a planned shift exists the same day. */
export function shouldShowShiftInAdminLogs(shift: ShiftForLinking, allShifts: ShiftForLinking[]) {
  if (!isAutoPunchShift(shift.note)) return true;
  const key = employeeDayKey(shift.employeeId, shift.startTime);
  return !allShifts.some(
    (s) =>
      s.id !== shift.id &&
      employeeDayKey(s.employeeId, s.startTime) === key &&
      !isAutoPunchShift(s.note) &&
      s.note !== "VAC"
  );
}
