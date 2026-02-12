import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DayKey = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

type DayAvailability = {
  day: DayKey;
  available: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  note: string;
};

const DAY_TO_INT: Record<DayKey, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const INT_TO_DAY: Record<number, DayKey> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
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
  if (s === null || e === null) return false;
  return e > s;
}

async function getEmployeeFromKioskSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("kiosk_session")?.value;
  if (!sessionId) return null;

  const now = new Date();

  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: { select: { id: true, isActive: true } },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= now) return null;
  if (!session.employee?.isActive) return null;

  return session.employee; // {id, isActive}
}

function defaultWeek(): DayAvailability[] {
  const days: DayKey[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days.map((day) => ({
    day,
    available: false,
    start: "09:00",
    end: "17:00",
    note: "",
  }));
}

export async function GET() {
  const employee = await getEmployeeFromKioskSession();
  if (!employee) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const rules = await prisma.recurringShiftRule.findMany({
    where: { employeeId: employee.id, active: true },
    select: { dayOfWeek: true, startHHMM: true, endHHMM: true, note: true },
  });

  const week = defaultWeek();

  for (const r of rules) {
    const key = INT_TO_DAY[r.dayOfWeek];
    const idx = week.findIndex((d) => d.day === key);
    if (idx >= 0) {
      week[idx] = {
        day: key,
        available: true,
        start: r.startHHMM,
        end: r.endHHMM,
        note: r.note ?? "",
      };
    }
  }

  return NextResponse.json({ ok: true, week });
}

export async function POST(req: Request) {
  const employee = await getEmployeeFromKioskSession();
  if (!employee) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { week?: DayAvailability[] } | null;
  const week = body?.week;

  if (!Array.isArray(week) || week.length !== 7) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  // Basic validation
  const seen = new Set<DayKey>();
  for (const d of week) {
    if (!d || typeof d.day !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid day" }, { status: 400 });
    }
    if (!(d.day in DAY_TO_INT)) {
      return NextResponse.json({ ok: false, error: `Unknown day: ${String(d.day)}` }, { status: 400 });
    }
    if (seen.has(d.day)) {
      return NextResponse.json({ ok: false, error: "Duplicate day entries" }, { status: 400 });
    }
    seen.add(d.day);

    if (d.available) {
      if (!isValidRange(d.start, d.end)) {
        return NextResponse.json(
          { ok: false, error: `Invalid time range for ${d.day}` },
          { status: 400 }
        );
      }
      if (typeof d.note !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid note" }, { status: 400 });
      }
    }
  }

  // Write in a transaction
  await prisma.$transaction(async (tx) => {
    // Upsert available days
    for (const d of week) {
      const dayOfWeek = DAY_TO_INT[d.day];

      if (!d.available) continue;

      await tx.recurringShiftRule.upsert({
        where: {
          employeeId_dayOfWeek: {
            employeeId: employee.id,
            dayOfWeek,
          },
        },
        create: {
          employeeId: employee.id,
          dayOfWeek,
          startHHMM: d.start,
          endHHMM: d.end,
          note: d.note.trim() ? d.note.trim() : null,
          active: true,
          locked: false,
          // startsOn default is fine; you can set to now if you want
        },
        update: {
          startHHMM: d.start,
          endHHMM: d.end,
          note: d.note.trim() ? d.note.trim() : null,
          active: true,
        },
      });
    }

    // For unavailable days: delete rules (cleanest) OR set active=false
    const unavailableInts = week
      .filter((d) => !d.available)
      .map((d) => DAY_TO_INT[d.day]);

    await tx.recurringShiftRule.deleteMany({
      where: {
        employeeId: employee.id,
        dayOfWeek: { in: unavailableInts },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
