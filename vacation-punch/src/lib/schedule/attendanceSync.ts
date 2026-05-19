import { prisma } from "@/lib/prisma";
import {
  shouldFlagAttendancePending,
  type ShiftAttendanceRow,
} from "@/lib/punch/attendanceReview";
import { mergeOrphanPunchesOntoPlannedShifts, type PunchEventLite } from "@/lib/punch/punchShiftLinking";

type ShiftRow = ShiftAttendanceRow & { employeeId: string };

/** Mark ended no-show shifts as PENDING so they disappear from the public schedule. */
export async function syncAttendancePendingForShifts(shifts: ShiftRow[]) {
  if (!shifts.length) return;

  const shiftIds = shifts.map((s) => s.id);
  const punchEvents = await prisma.punchEvent.findMany({
    where: {
      shiftId: { in: shiftIds },
      type: { in: ["CLOCK_IN", "CLOCK_OUT"] },
    },
    select: { id: true, employeeId: true, type: true, at: true, source: true, shiftId: true },
  });

  const punchesByShift = new Map<string, PunchEventLite[]>();
  for (const p of punchEvents) {
    if (!p.shiftId) continue;
    const arr = punchesByShift.get(p.shiftId) ?? [];
    arr.push(p);
    punchesByShift.set(p.shiftId, arr);
  }

  mergeOrphanPunchesOntoPlannedShifts(shifts, punchesByShift);

  const toPending: string[] = [];
  for (const s of shifts) {
    if (s.attendanceReview !== "NONE") continue;
    const punches = punchesByShift.get(s.id) ?? [];
    if (shouldFlagAttendancePending(s, punches)) toPending.push(s.id);
  }

  if (toPending.length) {
    await prisma.shift.updateMany({
      where: { id: { in: toPending }, attendanceReview: "NONE" },
      data: { attendanceReview: "PENDING" },
    });
    for (const s of shifts) {
      if (toPending.includes(s.id)) s.attendanceReview = "PENDING";
    }
  }
}
