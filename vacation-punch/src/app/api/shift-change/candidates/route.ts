import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hhmmToMinutes(s: string): number | null {
  if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [hh, mm] = s.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

// Assumes shift does not cross midnight
function availabilityOverlapsShift(ruleStart: string, ruleEnd: string, shiftStart: Date, shiftEnd: Date): boolean {
  const rs = hhmmToMinutes(ruleStart);
  const re = hhmmToMinutes(ruleEnd);
  if (rs === null || re === null) return false;

  const ss = shiftStart.getHours() * 60 + shiftStart.getMinutes();
  const se = shiftEnd.getHours() * 60 + shiftEnd.getMinutes();

  return rs < se && re > ss;
}

async function getEmployeeFromKioskSession() {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value;
  if (!sessionId) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: { select: { id: true, companyId: true, isActive: true } },
    },
  });

  if (!session) return null;
  if (Date.now() >= session.expiresAt.getTime()) return null;
  if (!session.employee?.isActive) return null;

  return session.employee; // { id, companyId, isActive }
}

async function getEmployeeFromCode(code: string) {
  const clean = String(code).replace(/\D/g, "").slice(0, 10);
  if (!clean) return null;

  const employee = await prisma.employee.findUnique({
    where: { employeeCode: clean },
    select: { id: true, companyId: true, isActive: true },
  });

  if (!employee || !employee.isActive) return null;
  return employee;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shiftId = String(url.searchParams.get("shiftId") ?? "").trim();
  const code = String(url.searchParams.get("code") ?? "").trim();

  if (!shiftId) {
    return NextResponse.json({ ok: false, error: "Missing shiftId" }, { status: 400 });
  }

  const me = (await getEmployeeFromKioskSession()) ?? (code ? await getEmployeeFromCode(code) : null);

  if (!me) {
    return NextResponse.json(
      { ok: false, error: code ? "Code invalide" : "Missing employee code" },
      { status: 400 }
    );
  }

  // 1) shift to replace
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      employeeId: true,
      employee: { select: { companyId: true, department: true } },
    },
  });

  if (!shift) return NextResponse.json({ ok: false, error: "Shift not found" }, { status: 404 });
  if (shift.employee.companyId !== me.companyId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const start = shift.startTime;
  const end = shift.endTime;
  if (end <= start) return NextResponse.json({ ok: false, error: "Invalid shift interval" }, { status: 400 });

  const dayOfWeek = start.getDay(); // 0=Sun..6=Sat

  // 2) employees already busy overlapping that shift
  const busy = await prisma.shift.findMany({
    where: {
      employee: { companyId: me.companyId, isActive: true },
      startTime: { lt: end },
      endTime: { gt: start },
      status: { in: ["PLANNED"] },
    },
    select: { employeeId: true },
  });
  const busyIds = new Set(busy.map((x) => x.employeeId));

  // 3) employees on APPROVED vacation overlapping
  const vac = await prisma.vacationRequest.findMany({
    where: {
      employee: { companyId: me.companyId, isActive: true },
      status: "APPROVED",
      startDate: { lt: end },
      endDate: { gt: start },
    },
    select: { employeeId: true },
  });
  const vacIds = new Set(vac.map((x) => x.employeeId));

  // 4) availability rules that day (same department, EMPLOYEE role)
  const rules = await prisma.availabilityRule.findMany({
    where: {
      dayOfWeek,
      available: true,
      employee: {
        companyId: me.companyId,
        isActive: true,
        id: { not: shift.employeeId },
        department: shift.employee.department,
        role: "EMPLOYEE",
      },
    },
    select: {
      startHHMM: true,
      endHHMM: true,
      note: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          role: true,
        },
      },
    },
    take: 500,
  });

  // 5) overlap + exclusions
  const eligibleRaw = rules
    .filter((r) => availabilityOverlapsShift(r.startHHMM, r.endHHMM, start, end))
    .map((r) => ({
      id: r.employee.id,
      name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      department: r.employee.department,
      role: r.employee.role,
      availNote: r.note ?? "",
    }))
    .filter((e) => !busyIds.has(e.id))
    .filter((e) => !vacIds.has(e.id));

  // dedupe safety
  const seen = new Set<string>();
  const eligible = eligibleRaw.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  return NextResponse.json({
    ok: true,
    shift: {
      id: shift.id,
      startTime: start,
      endTime: end,
      department: shift.employee.department,
    },
    eligible,
  });
}