export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function nextDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ymd = (url.searchParams.get("date") ?? "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const dayStart = startOfDayUTC(ymd);
    const dayEnd = nextDayUTC(ymd);

    // Find shifts overlapping that day, then return employees
    const shifts = await prisma.shift.findMany({
      where: {
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
        status: { in: ["PLANNED", "COMPLETED"] },
        employee: { isActive: true },
      },
      select: {
        employeeId: true,
        startTime: true,
        endTime: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, department: true },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // Deduplicate employees + keep earliest shift window for display
    const map = new Map<string, any>();
    for (const s of shifts) {
      if (!map.has(s.employeeId)) {
        map.set(s.employeeId, {
          id: s.employee.id,
          firstName: s.employee.firstName,
          lastName: s.employee.lastName,
          employeeCode: s.employee.employeeCode,
          department: s.employee.department,
          startISO: s.startTime.toISOString(),
          endISO: s.endTime.toISOString(),
        });
      }
    }

    return NextResponse.json({
      date: ymd,
      employees: Array.from(map.values()),
    });
  } catch (e: any) {
    console.error("employees-working error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
