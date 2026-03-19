export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const shiftId = String(body?.shiftId ?? "").trim();
    const pin = onlyDigits(String(body?.pin ?? body?.code ?? body?.employeeCode ?? "").trim()).slice(0, 4);

    if (!shiftId || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, employeeId: true, employee: { select: { companyId: true } }, startTime: true },
    });

    if (!shift) return NextResponse.json({ ok: false, error: "Shift introuvable" }, { status: 404 });

    // In the current schema, pharmacists are identified by role.
    // We treat employeeCode (4 digits) as the pharmacist PIN.
    const pharmacist = await prisma.employee.findFirst({
      where: {
        companyId: shift.employee.companyId,
        employeeCode: pin,
        isActive: true,
        role: { in: [Role.MANAGER, Role.ADMIN] },
      },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, role: true },
    });

    if (!pharmacist) {
      return NextResponse.json({ ok: false, error: "PIN pharmacien invalide (ou pas un pharmacien)" }, { status: 401 });
    }

    await prisma.auditLog.create({
      data: {
        actorId: pharmacist.id,
        companyId: shift.employee.companyId,
        action: "OVERTIME_ACCEPTED_BY_PHARMACIST",
        target: shiftId,
        meta: {
          kind: "OVERTIME",
          pharmacistEmployeeId: pharmacist.id,
          pharmacistName: `${pharmacist.firstName} ${pharmacist.lastName}`.trim(),
        },
      },
    });

    return NextResponse.json({ ok: true, pharmacistName: `${pharmacist.firstName} ${pharmacist.lastName}`.trim() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Pharmacien sign failed" }, { status: 500 });
  }
}

