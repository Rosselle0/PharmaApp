// src/app/schedule/edit/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import ScheduleEditorClient from "./ui";


const TZ = process.env.APP_TZ || "America/Toronto";

// format a Date into YMD in the business timezone
function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// get YYYY/MM/DD/HH/MM parts in TZ for a given Date
function partsInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value;

  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    da: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
  };
}

// Construct a Date that represents (ymd + hhmm) in TZ (DST-safe enough for Montreal)
function makeDateInTZ(ymd: string, hhmm: string) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);

  // initial guess: treat wall time as UTC
  let utc = Date.UTC(Y, M - 1, D, hh, mm, 0, 0);

  // iterate to correct to the TZ wall time
  for (let i = 0; i < 3; i++) {
    const guess = new Date(utc);
    const p = partsInTZ(guess);

    // difference between desired wall time and current wall time in minutes
    const diffMin =
      (p.y - Y) * 525600 +
      (p.mo - M) * 43200 +
      (p.da - D) * 1440 +
      (p.hh - hh) * 60 +
      (p.mm - mm);

    if (diffMin === 0) break;
    utc -= diffMin * 60000;
  }

  return new Date(utc);
}

async function applyRecurringFillMissing(companyId: string, weekStart: Date, weekEnd: Date) {
  // rules for active employees in this company
  const rules = await prisma.recurringShiftRule.findMany({
    where: {
      active: true,
      employee: { is: { companyId, isActive: true } },
      OR: [{ endsOn: null }, { endsOn: { gte: weekStart } }],
      startsOn: { lte: weekEnd },
    },
    select: {
      id: true,
      employeeId: true,
      dayOfWeek: true,
      startHHMM: true,
      endHHMM: true,
      note: true,
      locked: true,
    },
  });

  if (!rules.length) return;

  // Fetch existing shifts in a broader window and compare by TZ day key (same trick you used)
  const windowStart = new Date(weekStart.getTime() - 36 * 3600 * 1000);
  const windowEnd = new Date(weekEnd.getTime() + 36 * 3600 * 1000);

  const existing = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: { employeeId: true, startTime: true },
  });

  const existingKeys = new Set<string>();
  for (const s of existing) {
    existingKeys.add(`${s.employeeId}:${ymdInTZ(new Date(s.startTime))}`);
  }

  // build the 7 day keys (ymd) in TZ based on the provided weekStart (which is Sunday)
  const daysYMD: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    daysYMD.push(ymdInTZ(d));
  }

  const toCreate: any[] = [];

  for (const r of rules) {
    const dayYMD = daysYMD[r.dayOfWeek];
    if (!dayYMD) continue;

    const key = `${r.employeeId}:${dayYMD}`;
    if (existingKeys.has(key)) continue; // FILL_MISSING

    const startTime = makeDateInTZ(dayYMD, r.startHHMM);
    const endTime = makeDateInTZ(dayYMD, r.endHHMM);

    if (+endTime <= +startTime) continue;

    toCreate.push({
      employeeId: r.employeeId,
      startTime,
      endTime,
      note: r.note ?? null,
      status: "PLANNED",
      source: "RECURRING",
      ruleId: r.id,
    });

    existingKeys.add(key);
  }

  if (toCreate.length) {
    await prisma.shift.createMany({ data: toCreate });
  }
}


function startOfWeekSunday(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymdLocal(d: Date) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getDefaultCompany() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  return (
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }))
  );
}

export default async function ScheduleEditPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  noStore();

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true },
  });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const company = await getDefaultCompany();
  const companyId = company.id;

  const sp = await searchParams; // ✅ UNWRAP PROMISE
  const base = sp.week ? new Date(sp.week + "T12:00:00") : new Date();

  const weekStart = startOfWeekSunday(base);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  await applyRecurringFillMissing(companyId, weekStart, weekEnd);

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, department: true },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      AND: [{ startTime: { lt: weekEnd } }, { endTime: { gt: weekStart } }],
    },
    orderBy: [{ startTime: "asc" }],
    select: { id: true, employeeId: true, startTime: true, endTime: true, note: true },
  });

  const shiftsForClient = shifts.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    note: s.note ?? null,
  }));

  return (
    <ScheduleEditorClient
      weekStartYMD={ymdLocal(weekStart)}
      daysYMD={days.map(ymdLocal)}
      employees={employees}
      shifts={shiftsForClient}
    />
  );
}
