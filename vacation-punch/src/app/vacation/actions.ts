"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function isValidDateYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTimeHHMM(s: string) {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function enterEmployeeCode(formData: FormData) {
  const employeeCode = String(formData.get("employeeCode") ?? "").trim();
  if (!employeeCode) redirect("/vacation");

  // Redirect back with code in URL so server page can load employee + requests.
  redirect(`/vacation?code=${encodeURIComponent(employeeCode)}`);
}

export async function createVacationRequest(formData: FormData) {
  const employeeCode = String(formData.get("employeeCode") ?? "").trim();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();

  const startTimeRaw = String(formData.get("startTime") ?? "").trim();
  const endTimeRaw = String(formData.get("endTime") ?? "").trim();

  if (!employeeCode) throw new Error("employeeCode manquant.");
  if (!isValidDateYYYYMMDD(start) || !isValidDateYYYYMMDD(end)) throw new Error("Dates invalides.");
  if (end < start) throw new Error("La date de fin doit être après la date de début.");

  const isSingleDay = start === end;

  const startTime = startTimeRaw ? startTimeRaw : null;
  const endTime = endTimeRaw ? endTimeRaw : null;

  // times only allowed for single day
  if (!isSingleDay && (startTime || endTime)) {
    throw new Error("Les heures sont permises seulement si Début = Fin.");
  }

  if (isSingleDay && (startTime || endTime)) {
    if (!startTime || !endTime) throw new Error("Indiquez heure début ET heure fin.");
    if (!isValidTimeHHMM(startTime) || !isValidTimeHHMM(endTime)) throw new Error("Heures invalides.");
    if (endTime <= startTime) throw new Error("L’heure de fin doit être après l’heure de début.");
  }

  const employee = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true, isActive: true },
  });

  if (!employee || !employee.isActive) throw new Error("Employé invalide ou inactif.");

  // ✅ No 31-day limit anywhere.
  await prisma.vacationRequest.create({
    data: {
      employeeId: employee.id,
      startDate: new Date(`${start}T00:00:00`),
      endDate: new Date(`${end}T00:00:00`),
      reason: reasonRaw.length ? reasonRaw : null,
      startTime,
      endTime,
      status: "PENDING",
    },
  });

  redirect(`/vacation?code=${encodeURIComponent(employeeCode)}`);
}

export async function cancelPendingRequest(vacationId: string, employeeCode: string) {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true },
  });

  if (!employee) throw new Error("Employé invalide.");

  const req = await prisma.vacationRequest.findUnique({
    where: { id: vacationId },
    select: { id: true, status: true, employeeId: true },
  });

  if (!req || req.employeeId !== employee.id) throw new Error("Demande introuvable.");
  if (req.status !== "PENDING") throw new Error("Seules les demandes en attente peuvent être annulées.");

  await prisma.vacationRequest.update({
    where: { id: vacationId },
    data: { status: "CANCELLED" },
  });

  redirect(`/vacation?code=${encodeURIComponent(employeeCode)}`);
}
