import type { AttendanceReview } from "@prisma/client";
import { isAutoPunchShift } from "@/lib/punch/shiftNotes";

const TZ = process.env.APP_TZ || "America/Toronto";

/** Minutes after scheduled end before a no-show is flagged for manager review. */
export const ATTENDANCE_REVIEW_GRACE_MINUTES = 30;

export function ymdInAppTz(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type ShiftAttendanceRow = {
  id: string;
  employeeId: string;
  startTime: Date;
  endTime: Date;
  note: string | null;
  attendanceReview: AttendanceReview;
};

export function shiftHasClockIn(punches: { type: string }[]) {
  return punches.some((p) => p.type === "CLOCK_IN");
}

/** Shift ended and employee never clocked in — needs manager decision. */
export function shouldFlagAttendancePending(
  shift: ShiftAttendanceRow,
  punches: { type: string }[],
  now = new Date()
) {
  if (shift.attendanceReview === "CONFIRMED" || shift.attendanceReview === "DECLINED") return false;
  if (isAutoPunchShift(shift.note)) return false;
  if (shift.note === "VAC") return false;
  if (shiftHasClockIn(punches)) return false;
  const cutoff = shift.endTime.getTime() + ATTENDANCE_REVIEW_GRACE_MINUTES * 60_000;
  return now.getTime() >= cutoff;
}

export function isHiddenFromSchedule(shift: Pick<ShiftAttendanceRow, "attendanceReview">) {
  return shift.attendanceReview === "PENDING" || shift.attendanceReview === "DECLINED";
}

export function employeeDayKey(employeeId: string, startTime: Date) {
  return `${employeeId}:${ymdInAppTz(startTime)}`;
}
