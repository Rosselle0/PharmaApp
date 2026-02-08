import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function makeLocalDateTime(dayYMD: string, hhmm: string) {
  const d = new Date(dayYMD + "T00:00:00");
  const [hh, mm] = hhmm.split(":").map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const weekStartYMD = String(body.weekStartYMD ?? "");
  const mode = String(body.mode ?? "FILL_MISSING"); // FILL_MISSING | OVERWRITE_RECURRING

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartYMD)) {
    return NextResponse.json({ error: "Invalid weekStartYMD" }, { status: 400 });
  }
  if (mode !== "FILL_MISSING" && mode !== "OVERWRITE_RECURRING") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const weekStart = new Date(weekStartYMD + "T00:00:00");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // 0..6 day YMD list (Sun..Sat based on your UI)
  const daysYMD: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    daysYMD.push(ymdLocal(d));
  }

  // If overwriting recurring-generated shifts for this week:
  if (mode === "OVERWRITE_RECURRING") {
    await prisma.shift.deleteMany({
      where: {
        startTime: { gte: weekStart, lt: weekEnd },
        source: "RECURRING",
      },
    });
  }

  // get active rules
  const rules = await prisma.recurringShiftRule.findMany({
    where: {
      active: true,
      OR: [
        { endsOn: null },
        { endsOn: { gte: weekStart } },
      ],
      startsOn: { lte: weekEnd },
    },
  });

  // pull existing shifts for the week for quick checks
  const existing = await prisma.shift.findMany({
    where: { startTime: { gte: weekStart, lt: weekEnd } },
    select: { id: true, employeeId: true, startTime: true },
  });

  const existsKey = new Set<string>();
  for (const s of existing) {
    const k = `${s.employeeId}:${ymdLocal(new Date(s.startTime))}`;
    existsKey.add(k);
  }

  const toCreate: Array<{
    employeeId: string;
    startTime: Date;
    endTime: Date;
    note: string | null;
    source: "RECURRING";
    ruleId: string;
  }> = [];

  for (const r of rules) {
    const dayYMD = daysYMD[r.dayOfWeek]; // 0..6 maps to week day in your table
    if (!dayYMD) continue;

    const key = `${r.employeeId}:${dayYMD}`;

    // FILL_MISSING => skip if anything already exists for that employee/day
    if (mode === "FILL_MISSING" && existsKey.has(key)) continue;

    const startTime = makeLocalDateTime(dayYMD, r.startHHMM);
    const endTime = makeLocalDateTime(dayYMD, r.endHHMM);

    if (endTime.getTime() <= startTime.getTime()) continue;

    toCreate.push({
      employeeId: r.employeeId,
      startTime,
      endTime,
      note: r.note ?? null,
      source: "RECURRING",
      ruleId: r.id,
    });

    existsKey.add(key);
  }

  if (toCreate.length) {
    await prisma.shift.createMany({ data: toCreate });
  }

  // return updated shifts for this week
  const shifts = await prisma.shift.findMany({
    where: { startTime: { gte: weekStart, lt: weekEnd } },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ shifts });
}
