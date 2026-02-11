"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ShiftStatus, VacationStatus } from "@prisma/client";

function assertYmd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date (YYYY-MM-DD).");
}
function ymdToNoon(ymd: string): Date {
  assertYmd(ymd);
  return new Date(`${ymd}T12:00:00`);
}
function addDaysNoon(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(12, 0, 0, 0);
  return x;
}
function daysInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let cur = new Date(start); cur <= end; cur = addDaysNoon(cur, 1)) out.push(new Date(cur));
  return out;
}

export async function enterEmployeeCode(formData: FormData) {
  const code = String(formData.get("employeeCode") ?? "").trim();
  if (!code) throw new Error("Enter your employee code.");

  const emp = await prisma.employee.findUnique({
    where: { employeeCode: code },
    select: { employeeCode: true, isActive: true },
  });
  if (!emp || !emp.isActive) throw new Error("Invalid employee code.");

  redirect(`/vacation?code=${encodeURIComponent(emp.employeeCode)}`);
}

export async function createVacationRequest(formData: FormData) {
  const employeeCode = String(formData.get("employeeCode") ?? "").trim();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!employeeCode) throw new Error("Missing employee code.");

  const emp = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true, employeeCode: true, isActive: true },
  });
  if (!emp || !emp.isActive) throw new Error("Employee not found.");

  const startDate = ymdToNoon(start);
  const endDate = ymdToNoon(end);
  if (endDate < startDate) throw new Error("End date must be >= start date.");

  const days = Math.floor((+endDate - +startDate) / 86400000) + 1;
  if (days < 1 || days > 31) throw new Error("Vacation request must be 1–31 days.");

  const overlap = await prisma.vacationRequest.findFirst({
    where: {
      employeeId: emp.id,
      status: { in: [VacationStatus.PENDING, VacationStatus.APPROVED] },
      AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
    },
    select: { id: true },
  });
  if (overlap) throw new Error("Overlaps an existing pending/approved request.");

  await prisma.vacationRequest.create({
    data: { employeeId: emp.id, startDate, endDate, reason, status: VacationStatus.PENDING },
  });

  revalidatePath("/vacation");
  redirect(`/vacation?code=${encodeURIComponent(emp.employeeCode)}`);
}

export async function cancelPendingRequest(requestId: string, employeeCode: string) {
  const emp = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true },
  });
  if (!emp) throw new Error("Employee not found.");

  const updated = await prisma.vacationRequest.updateMany({
    where: { id: requestId, employeeId: emp.id, status: VacationStatus.PENDING },
    data: { status: VacationStatus.CANCELLED },
  });
  if (updated.count === 0) throw new Error("Cannot cancel.");

  revalidatePath("/vacation");
  redirect(`/vacation?code=${encodeURIComponent(employeeCode)}`);
}
