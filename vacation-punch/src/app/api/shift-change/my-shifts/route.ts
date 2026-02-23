export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";

const TZ = process.env.APP_TZ || "America/Toronto";

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
}

function startOfDayInTZ(now: Date) {
  // Build "today 00:00" in TZ, then convert to a real Date
  const ymd = ymdInTZ(now);
  const [y, m, d] = ymd.split("-").map(Number);

  // This creates a Date at UTC midnight, which is NOT TZ midnight.
  // So we must compute TZ midnight by formatting parts.
  // Easiest robust trick: take noon UTC and back-calc is messy.
  // Simple + good enough approach: query by date range using TZ formatting.
  return { ymd, y, m, d };
}

export async function GET(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const now = new Date();
  const { ymd } = startOfDayInTZ(now);

  // Compute UTC range for that local day by stepping 48h and filtering by formatted ymd in TZ.
  // We'll do a simpler approach: fetch planned shifts and filter in JS by TZ date >= today.
  const rows = await prisma.shift.findMany({
    where: { employeeId: auth.employeeId, status: "PLANNED" },
    orderBy: { startTime: "asc" },
    select: { id: true, startTime: true, endTime: true, status: true, note: true },
  });

  const shifts = rows
    .filter((s) => ymdInTZ(s.startTime) >= ymd) // from today onward in TZ
    .filter((s) => !((s.note ?? "").toUpperCase().includes("VAC"))); // hide VAC notes

  return NextResponse.json({
    ok: true,
    shifts,
    debug: {
      tz: TZ,
      todayYMD_TZ: ymd,
      nowISO: now.toISOString(),
      totalPlanned: rows.length,
      returnedAfterTZDayFilter: shifts.length,
    },
  });
}