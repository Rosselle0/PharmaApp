export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTomorrowShiftsReminderEmail } from "@/lib/mailer";
import { addCalendarDaysYmd, ymdInTZ } from "@/lib/shiftChange/time";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  if (process.env.SHIFT_REMINDER_DISABLED === "1" || process.env.SHIFT_REMINDER_DISABLED === "true") {
    return NextResponse.json({ ok: true, skipped: true, reason: "SHIFT_REMINDER_DISABLED" });
  }

  const now = new Date();
  const tomorrowYmd = addCalendarDaysYmd(ymdInTZ(now), 1);

  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  // Fenêtre large en UTC puis filtre métier ci‑dessous : on ne garde que « demain » en APP_TZ.
  const shifts = await prisma.shift.findMany({
    where: {
      status: ShiftStatus.PLANNED,
      startTime: { gte: windowStart, lte: windowEnd },
      employee: { isActive: true },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      note: true,
      employee: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  // Uniquement les quarts qui *commencent demain* (jour civil APP_TZ) + email renseigné.
  // Aucun envoi aux autres employés (pas de diffusion globale).
  const candidates = shifts.filter(
    (s) => Boolean(s.employee.email?.trim()) && ymdInTZ(s.startTime) === tomorrowYmd
  );

  if (!candidates.length) {
    return NextResponse.json({
      ok: true,
      tomorrowYmd,
      message: "Aucun quart demain avec email.",
      employeesNotified: 0,
      shiftsMarked: 0,
    });
  }

  const shiftIds = candidates.map((s) => s.id);
  const already = await prisma.shiftDayReminder.findMany({
    where: { shiftYmd: tomorrowYmd, shiftId: { in: shiftIds } },
    select: { shiftId: true },
  });
  const done = new Set(already.map((r) => r.shiftId));
  const pending = candidates.filter((s) => !done.has(s.id));

  if (!pending.length) {
    return NextResponse.json({
      ok: true,
      tomorrowYmd,
      message: "Rappels déjà envoyés pour ces quarts.",
      employeesNotified: 0,
      shiftsMarked: 0,
    });
  }

  type Bundle = {
    email: string;
    firstName: string;
    shifts: typeof pending;
  };
  const byEmployee = new Map<string, Bundle>();
  for (const s of pending) {
    const email = s.employee.email!.trim();
    let b = byEmployee.get(s.employee.id);
    if (!b) {
      b = { email, firstName: s.employee.firstName, shifts: [] };
      byEmployee.set(s.employee.id, b);
    }
    b.shifts.push(s);
  }

  let employeesNotified = 0;
  let shiftsMarked = 0;
  const errors: string[] = [];

  for (const bundle of byEmployee.values()) {
    if (!bundle.shifts.length) continue;

    const sent = await sendTomorrowShiftsReminderEmail({
      to: bundle.email,
      firstName: bundle.firstName,
      shifts: bundle.shifts.map((s) => ({
        start: s.startTime,
        end: s.endTime,
        note: s.note,
      })),
    });

    if (!sent.ok) {
      errors.push(`${bundle.email}: ${sent.error}`);
      continue;
    }

    employeesNotified += 1;
    await prisma.shiftDayReminder.createMany({
      data: bundle.shifts.map((s) => ({ shiftId: s.id, shiftYmd: tomorrowYmd })),
      skipDuplicates: true,
    });
    shiftsMarked += bundle.shifts.length;
  }

  return NextResponse.json({
    ok: true,
    tomorrowYmd,
    employeesNotified,
    shiftsMarked,
    errors: errors.length ? errors : undefined,
  });
}
