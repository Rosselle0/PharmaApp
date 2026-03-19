// src/app/api/schedule/shifts/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";

const TZ = process.env.APP_TZ || "America/Toronto";

function timePartsInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
  return { hh, mm };
}

function hhmmInTZ(d: Date) {
  const { hh, mm } = timePartsInTZ(d);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isWithinHoursTZ(d: Date) {
  const { hh, mm } = timePartsInTZ(d);
  const h = hh + mm / 60;
  return h >= 8 && h <= 21;
}

function minutesFromHHMM(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

async function assertShiftMatchesAvailability(employeeId: string, startTime: Date, endTime: Date) {
  const dayOfWeek = startTime.getDay();

  const rule = await prisma.availabilityRule.findUnique({
    where: { employeeId_dayOfWeek: { employeeId, dayOfWeek } },
    select: { available: true, startHHMM: true, endHHMM: true },
  });

  if (!rule || !rule.available) {
    return { ok: false as const, error: "Cet employé n'est pas disponible cette journée." };
  }

  const shiftStart = minutesFromHHMM(hhmmInTZ(startTime) ?? "");
  const shiftEnd = minutesFromHHMM(hhmmInTZ(endTime) ?? "");
  const ruleStart = minutesFromHHMM(rule.startHHMM);
  const ruleEnd = minutesFromHHMM(rule.endHHMM);

  if (
    shiftStart === null ||
    shiftEnd === null ||
    ruleStart === null ||
    ruleEnd === null
  ) {
    return { ok: false as const, error: "Disponibilité invalide pour cet employé." };
  }

  if (shiftStart < ruleStart || shiftEnd > ruleEnd) {
    return {
      ok: false as const,
      error: `Plage refusée: disponibilité de l'employé ${rule.startHHMM}–${rule.endHHMM}.`,
    };
  }

  return { ok: true as const };
}

async function getDefaultCompany() {
  const companyName = process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning";
  return prisma.company.upsert({
    where: { name: companyName },
    create: { name: companyName },
    update: {},
    select: { id: true },
  });
}

export async function POST(req: Request) {
  // 🔐 unified guard (kiosk OR supabase)
  const auth = await requireKioskManagerOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = String(body.employeeId ?? "");
  if (!employeeId) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 🔐 enforce company ownership
  const companyId =
    (auth as any).companyId ??
    (await getDefaultCompany()).id;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, isActive: true },
    select: { id: true },
  });

  if (!employee) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let startTime: Date | null = null;
  let endTime: Date | null = null;

  if (body.startTime && body.endTime) {
    startTime = new Date(String(body.startTime));
    endTime = new Date(String(body.endTime));
  } else if (body.dayISO && body.startHHMM && body.endHHMM) {
    const base = new Date(String(body.dayISO));
    if (Number.isNaN(+base)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const [sh, sm] = body.startHHMM.split(":").map(Number);
    const [eh, em] = body.endHHMM.split(":").map(Number);

    startTime = new Date(base);
    endTime = new Date(base);

    startTime.setHours(sh, sm, 0, 0);
    endTime.setHours(eh, em, 0, 0);
  } else {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (!startTime || !endTime || +endTime <= +startTime) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  if (!isWithinHoursTZ(startTime) || !isWithinHoursTZ(endTime)) {
    return NextResponse.json({ error: "Allowed range is 08:00–21:00" }, { status: 400 });
  }

  const availabilityCheck = await assertShiftMatchesAvailability(employeeId, startTime, endTime);
  if (!availabilityCheck.ok) {
    return NextResponse.json({ error: availabilityCheck.error }, { status: 400 });
  }

  const note = body.note === null ? null : String(body.note ?? "").trim() || null;

  const repeatWeekly = Boolean(body.repeatWeekly);
  const locked = Boolean(body.locked);
  const dayOfWeek = Number(body.dayOfWeek);

  let ruleId: string | null = null;

  if (repeatWeekly) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: "Invalid dayOfWeek" }, { status: 400 });
    }

    const startHHMM = hhmmInTZ(startTime);
    const endHHMM = hhmmInTZ(endTime);

    // ✅ fix: Prisma needs strings, not null
    if (!startHHMM || !endHHMM) {
      return NextResponse.json({ error: "Invalid time format" }, { status: 400 });
    }

    // Unlock behavior:
    // - If the existing recurring rule was locked and now the boss "unlocks" (locked -> false),
    //   we deactivate the recurring rule and delete all future recurring shifts generated from it.
    const existingRule = await prisma.recurringShiftRule.findUnique({
      where: { employeeId_dayOfWeek: { employeeId, dayOfWeek } },
      select: { id: true, locked: true },
    });
    const wasLocked = Boolean(existingRule?.locked);
    const unlocking = wasLocked && !locked;

    const rule = await prisma.recurringShiftRule.upsert({
      where: { employeeId_dayOfWeek: { employeeId, dayOfWeek } },
      update: {
        startHHMM,
        endHHMM,
        note,
        locked,
        active: unlocking ? false : true,
      },
      create: {
        employeeId,
        dayOfWeek,
        startHHMM,
        endHHMM,
        note,
        locked,
        active: true,
      },
      select: { id: true },
    });

    ruleId = rule.id;

    if (unlocking) {
      // Remove all future shift instances of that recurring rule.
      await prisma.shift.deleteMany({
        where: {
          employeeId,
          ruleId: rule.id,
          source: "RECURRING",
          status: "PLANNED",
          startTime: { gt: startTime },
        },
      });
    }
  }

  const dayKey = ymdInTZ(startTime);

  const windowStart = new Date(startTime.getTime() - 36 * 3600 * 1000);
  const windowEnd = new Date(startTime.getTime() + 36 * 3600 * 1000);

  const candidates = await prisma.shift.findMany({
    where: {
      employeeId,
      status: "PLANNED",
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, startTime: true },
  });

  const existing = candidates.find((s) => ymdInTZ(new Date(s.startTime)) === dayKey);

  const shiftData = {
    startTime,
    endTime,
    note,
    ...(repeatWeekly
      ? { source: "RECURRING" as const, ruleId }
      : { source: "MANUAL" as const, ruleId: null }),
  };

  const shift = existing
    ? await prisma.shift.update({
      where: { id: existing.id },
      data: shiftData,
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        note: true,
        source: true,
        rule: { select: { locked: true } },
      },
    })
    : await prisma.shift.create({
      data: { employeeId, ...shiftData, status: "PLANNED" },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        note: true,
        source: true,
        rule: { select: { locked: true } },
      },
    });

  const ruleLocked = Boolean((shift as any)?.rule?.locked);
  const { rule: _rule, ...rest } = shift as any;
  return NextResponse.json({
    shift: {
      ...rest,
      ruleLocked,
    },
  });
}