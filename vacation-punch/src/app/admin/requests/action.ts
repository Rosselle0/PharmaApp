"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ShiftStatus, VacationStatus } from "@prisma/client";
import { getPrivilegedContextOrRedirect } from "@/lib/adminContext";

function addDaysNoon(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(12, 0, 0, 0);
  return x;
}

function daysInclusive(start: Date, end: Date): Date[] {
  const startNoon = new Date(start);
  startNoon.setHours(12, 0, 0, 0);
  const endNoon = new Date(end);
  endNoon.setHours(12, 0, 0, 0);

  const out: Date[] = [];
  for (let cur = new Date(startNoon); cur <= endNoon; cur = addDaysNoon(cur, 1)) {
    out.push(new Date(cur));
  }
  return out;
}
async function getDbUserIdFromAuthUserId(authUserId: string | null | undefined): Promise<string | null> {
  if (!authUserId) return null;
  const u = await prisma.user.findUnique({
    where: { authUserId },
    select: { id: true },
  });
  return u?.id ?? null;
}

export async function approveVacation(requestId: string) {
  const { adminUserId, companyIds } = await getPrivilegedContextOrRedirect();

  // Convert auth id -> DB user.id (prevents FK crash)
  const decidedByUserId =
    await getDbUserIdFromAuthUserId(adminUserId);

  await prisma.$transaction(async (tx) => {
    const req = await tx.vacationRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true } } },
    });

    if (!req) throw new Error("Demande introuvable.");
    if (!companyIds.includes(req.employee.companyId)) throw new Error("Mauvaise compagnie.");
    if (req.status !== VacationStatus.PENDING)
      throw new Error("Seules les demandes en attente peuvent être approuvées.");

    const rangeStart = new Date(req.startDate);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(req.endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const autoPunchNotes = ["PUNCH_AUTO", "PUNCH_AUTO_UNAVAILABLE"];

    // If someone punched during a pending vacation, the kiosk auto-creates shifts with PUNCH_AUTO*.
    // We remove those conflicts automatically so approving vacation doesn't throw red errors.
    await tx.shift.deleteMany({
      where: {
        employeeId: req.employeeId,
        status: ShiftStatus.PLANNED,
        note: { in: autoPunchNotes },
        AND: [{ startTime: { lt: rangeEnd } }, { endTime: { gt: rangeStart } }],
      },
    });

    const conflict = await tx.shift.findFirst({
      where: {
        employeeId: req.employeeId,
        status: ShiftStatus.PLANNED,
        NOT: { note: "VAC" },
        // auto-created punch shifts are no longer blocking, because we deleted them above.
        note: { notIn: autoPunchNotes },
        AND: [{ startTime: { lt: rangeEnd } }, { endTime: { gt: rangeStart } }],
      },
      select: { id: true },
    });

    if (conflict) throw new Error("Conflit: quarts déjà planifiés dans cette période.");

    await tx.shift.deleteMany({ where: { vacationRequestId: req.id } });

    const days = daysInclusive(req.startDate, req.endDate);

    await tx.shift.createMany({
      data: days.map((d) => {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);

        const end = new Date(d);
        end.setHours(23, 59, 59, 999);

        // If single-day partial time exists, use it
        const isSingleDay =
          req.startDate.toDateString() === req.endDate.toDateString() &&
          !!req.startTime &&
          !!req.endTime;

        if (isSingleDay && days.length === 1) {
          const [sh, sm] = req.startTime!.split(":").map(Number);
          const [eh, em] = req.endTime!.split(":").map(Number);
          if (Number.isFinite(sh) && Number.isFinite(sm) && Number.isFinite(eh) && Number.isFinite(em)) {
            start.setHours(sh, sm, 0, 0);
            end.setHours(eh, em, 0, 0);
          }
        }

        return {
          employeeId: req.employeeId,
          startTime: start,
          endTime: end,
          status: ShiftStatus.PLANNED,
          note: "VAC",
          vacationRequestId: req.id,
        };
      }),
    });

    await tx.vacationRequest.update({
      where: { id: req.id },
      data: {
        status: VacationStatus.APPROVED,
        decidedAt: new Date(),
        decidedByUserId, // ✅ DB user.id or null
      },
    });
  });

  revalidatePath("/admin/requests");
  revalidatePath("/schedule");
  redirect("/admin/requests");
}


export async function rejectVacation(requestId: string) {
  const { adminUserId, companyIds } = await getPrivilegedContextOrRedirect();
  const decidedByUserId = await getDbUserIdFromAuthUserId(adminUserId);

  await prisma.$transaction(async (tx) => {
    const req = await tx.vacationRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true } } },
    });

    if (!req) throw new Error("Demande introuvable.");
    if (!companyIds.includes(req.employee.companyId)) throw new Error("Mauvaise compagnie.");
    if (req.status !== VacationStatus.PENDING)
      throw new Error("Seules les demandes en attente peuvent être refusées.");

    await tx.vacationRequest.update({
      where: { id: req.id },
      data: {
        status: VacationStatus.REJECTED,
        decidedAt: new Date(),
        decidedByUserId, // ✅ DB user.id or null
      },
    });

    await tx.shift.deleteMany({ where: { vacationRequestId: req.id } });
  });

  revalidatePath("/admin/requests");
  revalidatePath("/schedule");
  redirect("/admin/requests");
}


export async function cancelApprovedVacation(requestId: string) {
  const { adminUserId, companyIds } = await getPrivilegedContextOrRedirect();
  const decidedByUserId = await getDbUserIdFromAuthUserId(adminUserId);

  await prisma.$transaction(async (tx) => {
    const req = await tx.vacationRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true } } },
    });

    if (!req) throw new Error("Demande introuvable.");
    if (!companyIds.includes(req.employee.companyId)) throw new Error("Mauvaise compagnie.");
    if (req.status !== VacationStatus.APPROVED)
      throw new Error("Seules les demandes approuvées peuvent être annulées.");

    await tx.vacationRequest.update({
      where: { id: req.id },
      data: {
        status: VacationStatus.CANCELLED,
        decidedAt: new Date(),
        decidedByUserId, // ✅ DB user.id or null
      },
    });

    await tx.shift.deleteMany({ where: { vacationRequestId: req.id } });
  });

  revalidatePath("/admin/requests");
  revalidatePath("/schedule");
  redirect("/admin/requests");
}

