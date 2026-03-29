import { prisma } from "@/lib/prisma";
import { ymdInTZ } from "@/lib/shiftChange/time";

/** True if lock should not apply anymore (new calendar day in APP_TZ vs last sortie, or no sortie). */
export function isPunchKioskLockExpiredByCalendarDay(lastClockOutAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastClockOutAt) return true;
  return ymdInTZ(lastClockOutAt) !== ymdInTZ(now);
}

/**
 * Verrou kiosque : actif seulement le jour civil (APP_TZ) du dernier CLOCK_OUT.
 * Passé minuit, le flag en base est remis à false.
 */
export async function resolvePunchKioskLocked(employeeId: string, dbLocked: boolean, now = new Date()): Promise<boolean> {
  if (!dbLocked) return false;

  const lastOut = await prisma.punchEvent.findFirst({
    where: { employeeId, type: "CLOCK_OUT" },
    orderBy: { at: "desc" },
    select: { at: true },
  });

  if (isPunchKioskLockExpiredByCalendarDay(lastOut?.at, now)) {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { punchKioskLocked: false },
    });
    return false;
  }

  return true;
}

/** Met à jour la base pour les employés encore marqués verrouillés alors que le jour du dernier CLOCK_OUT est passé. */
export async function expireStalePunchKioskLocksForEmployeeIds(
  lockedEmployeeIds: string[],
  now = new Date()
): Promise<Set<string>> {
  const cleared = new Set<string>();
  if (!lockedEmployeeIds.length) return cleared;

  const outs = await prisma.punchEvent.findMany({
    where: { employeeId: { in: lockedEmployeeIds }, type: "CLOCK_OUT" },
    orderBy: { at: "desc" },
    select: { employeeId: true, at: true },
  });
  const lastOutAt = new Map<string, Date>();
  for (const o of outs) {
    if (!lastOutAt.has(o.employeeId)) lastOutAt.set(o.employeeId, o.at);
  }

  const staleIds: string[] = [];
  for (const id of lockedEmployeeIds) {
    if (isPunchKioskLockExpiredByCalendarDay(lastOutAt.get(id), now)) {
      staleIds.push(id);
    }
  }

  if (staleIds.length) {
    await prisma.employee.updateMany({
      where: { id: { in: staleIds } },
      data: { punchKioskLocked: false },
    });
    for (const id of staleIds) cleared.add(id);
  }

  return cleared;
}
