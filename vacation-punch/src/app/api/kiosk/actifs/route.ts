export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// If you already use this guard elsewhere, use it here too.
// import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";

type UiState = "WORKING" | "BREAK" | "LUNCH" | "LEFT";

const TZ = process.env.APP_TZ || "America/Toronto";

// Get YYYY-MM-DD in business TZ
function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function startOfTodayInTZ(now: Date) {
  // Build "YYYY-MM-DDT00:00:00" and interpret as local time *in server*.
  // We avoid UTC reset by using the date string in TZ.
  const ymd = ymdInTZ(now); // "2026-02-24"
  // This makes a Date at midnight server-local; imperfect but good enough for demo.
  // If you want exact TZ midnight, we can tighten it later.
  return new Date(`${ymd}T00:00:00`);
}

function toState(punchType: string): UiState {
  switch (punchType) {
    case "CLOCK_IN":
      return "WORKING";
    case "BREAK_START":
      return "BREAK";
    case "BREAK_END":
      return "WORKING";
    case "LUNCH_START":
      return "LUNCH";
    case "LUNCH_END":
      return "WORKING";
    case "CLOCK_OUT":
      return "LEFT";
    default:
      return "WORKING";
  }
}

function minutesSince(d: Date) {
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export async function GET(req: Request) {
  // ✅ If you want kiosk-only access, enforce it here.
  // const auth = await requireEmployeeFromKioskOrCode(req);
  // if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const now = new Date();
  const dayStart = startOfTodayInTZ(now);

  // Pull today’s punches (latest first)
  const punches = await prisma.punchEvent.findMany({
    where: {
      at: { gte: dayStart },
      // If you want per-company filtering:
      // employee: { companyId: auth.companyId }
    },
    orderBy: { at: "desc" },
    select: {
      id: true,
      type: true,
      at: true,
      employeeId: true,
      employee: { select: { firstName: true, lastName: true } },
    },
    take: 500, // safety cap
  });

  // Latest punch per employee (since dayStart)
  const latestByEmployee = new Map<
    string,
    { employeeId: string; name: string; type: string; at: Date }
  >();

  for (const p of punches) {
    if (!latestByEmployee.has(p.employeeId)) {
      latestByEmployee.set(p.employeeId, {
        employeeId: p.employeeId,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        type: p.type,
        at: p.at,
      });
    }
  }

  const items = Array.from(latestByEmployee.values()).map((x) => {
    const state = toState(x.type);
    return {
      employeeId: x.employeeId,
      name: x.name,
      state,
      minutes: minutesSince(x.at),
      lastAt: x.at.toISOString(),
      lastType: x.type,
    };
  });

  // Show “Actifs” = not LEFT (your call)
  const actifs = items.filter((x) => x.state !== "LEFT");

  return NextResponse.json({ ok: true, actifs, all: items });
}