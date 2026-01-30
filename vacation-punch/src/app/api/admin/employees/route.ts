export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department } from "@prisma/client";

async function getDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";

  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));

  return company.id;
}

function normalizeDepartment(dep: any): Department {
  if (dep === "CASH_LAB" || dep === "FLOOR") return dep;
  return Department.FLOOR;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const employeeCode = String(body.employeeCode ?? "").trim();
    const department = normalizeDepartment(body.department);
    const paidBreak30 = Boolean(body.paidBreak30);

    if (!firstName || !lastName || employeeCode.length < 4) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Optional: only digits for employeeCode
    if (!/^\d+$/.test(employeeCode)) {
      return NextResponse.json({ error: "Employee code must be numeric" }, { status: 400 });
    }

    // Check uniqueness BEFORE create (you already do this)
    const existing = await prisma.employee.findUnique({
      where: { employeeCode },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }

    const companyId = await getDefaultCompanyId();

    const created = await prisma.employee.create({
      data: {
        firstName,
        lastName,
        employeeCode,
        department,
        paidBreak30,
        company: { connect: { id: companyId } }, // ✅ fixed
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        department: true,
        paidBreak30: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ employee: created }, { status: 201 });
  } catch (e: any) {
    // Prisma unique error (in case of race)
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
