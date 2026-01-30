export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

function normalizeDepartment(dep: any): Department {
  return dep === "CASH_LAB" || dep === "FLOOR" ? dep : Department.FLOOR;
}

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const employeeCode = String(body.employeeCode ?? "").trim();
    const department = normalizeDepartment(body.department);

    const paidBreak30 =
      body.paidBreak30 !== undefined ? Boolean(body.paidBreak30) : Boolean(body.paid30);

    if (!firstName || !lastName || employeeCode.length < 4) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!/^\d+$/.test(employeeCode)) {
      return NextResponse.json({ error: "Employee code must be numeric" }, { status: 400 });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        firstName,
        lastName,
        employeeCode,
        department,
        paidBreak30,
        isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        department: true,
        paidBreak30: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      employee: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        employeeCode: updated.employeeCode,
        department: updated.department,
        paid30: updated.paidBreak30,
        role: "EMPLOYEE",
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
