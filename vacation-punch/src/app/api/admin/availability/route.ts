export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

type DayKey = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

type DayAvailability = {
  day: DayKey;
  available: boolean;
  start: string;
  end: string;
  note: string;
};

const DAY_TO_INT: Record<DayKey, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const INT_TO_DAY: Record<number, DayKey> = {
  0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
};

function parseHHMM(t: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isValidRange(start: string, end: string): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  return s !== null && e !== null && e > s;
}

function defaultWeek(): DayAvailability[] {
  const days: DayKey[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days.map((day) => ({
    day,
    available: false,
    start: "08:00",
    end: "21:00",
    note: "",
  }));
}

export async function GET(req: Request) {
  const auth = await requirePrivilegedOrRedirect();

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ ok: false, error: "employeeId required" }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: auth.companyId, isActive: true },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
  }

  const rows = await prisma.availabilityRule.findMany({
    where: { employeeId },
    select: { dayOfWeek: true, available: true, startHHMM: true, endHHMM: true, note: true },
    orderBy: { dayOfWeek: "asc" },
  });

  const week = defaultWeek();
  for (const r of rows) {
    const key = INT_TO_DAY[r.dayOfWeek];
    if (!key) continue;
    const idx = week.findIndex((d) => d.day === key);
    if (idx >= 0) {
      week[idx] = {
        day: key,
        available: r.available,
        start: r.startHHMM,
        end: r.endHHMM,
        note: r.note ?? "",
      };
    }
  }

  return NextResponse.json({ ok: true, week });
}

export async function POST(req: Request) {
  const auth = await requirePrivilegedOrRedirect();

  const body = (await req.json().catch(() => null)) as {
    employeeId?: string;
    week?: DayAvailability[];
  } | null;

  const employeeId = body?.employeeId;
  const week = body?.week;

  if (!employeeId || typeof employeeId !== "string") {
    return NextResponse.json({ ok: false, error: "employeeId required" }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: auth.companyId, isActive: true },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
  }

  if (!Array.isArray(week) || week.length !== 7) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const seen = new Set<DayKey>();
  for (const d of week) {
    if (!d || typeof d.day !== "string" || !(d.day in DAY_TO_INT)) {
      return NextResponse.json({ ok: false, error: "Invalid day" }, { status: 400 });
    }
    if (seen.has(d.day)) {
      return NextResponse.json({ ok: false, error: "Duplicate day entries" }, { status: 400 });
    }
    seen.add(d.day);

    if (typeof d.available !== "boolean") {
      return NextResponse.json({ ok: false, error: "Invalid available flag" }, { status: 400 });
    }
    if (typeof d.note !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid note" }, { status: 400 });
    }
    if (d.note.length > 200) {
      return NextResponse.json({ ok: false, error: "Note trop longue (max 200)" }, { status: 400 });
    }

    if (d.available && !isValidRange(d.start, d.end)) {
      return NextResponse.json({ ok: false, error: `Plage horaire invalide pour ${d.day}` }, { status: 400 });
    }
  }

  await prisma.$transaction(
    week.map((d) => {
      const dayOfWeek = DAY_TO_INT[d.day];
      return prisma.availabilityRule.upsert({
        where: { employeeId_dayOfWeek: { employeeId, dayOfWeek } },
        create: {
          employeeId,
          dayOfWeek,
          available: d.available,
          startHHMM: d.start,
          endHHMM: d.end,
          note: d.note.trim() ? d.note.trim() : null,
        },
        update: {
          available: d.available,
          startHHMM: d.start,
          endHHMM: d.end,
          note: d.note.trim() ? d.note.trim() : null,
        },
      });
    })
  );

  return NextResponse.json({ ok: true });
}
