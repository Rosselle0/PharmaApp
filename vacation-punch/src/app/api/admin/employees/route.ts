export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department, Role } from "@prisma/client";
import { getCompanyId } from "@/lib/company";

function normalizeDepartment(dep: any): Department {
  const v = String(dep ?? "").toUpperCase();
  if (v === "CASH") return Department.CASH;
  if (v === "LAB") return Department.LAB;
  if (v === "FLOOR") return Department.FLOOR;
  return Department.FLOOR;
}

function normalizeRole(role: any): Role {
  const v = String(role ?? "").toUpperCase();
  if (v === "ADMIN") return Role.ADMIN;
  if (v === "MANAGER") return Role.MANAGER;
  return Role.EMPLOYEE;
}

export async function GET() {
  const companyId = await getCompanyId();

  const employees = await prisma.employee.findMany({
    where: { companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      department: true,
      role: true,          // ✅ ADD THIS
      paidBreak30: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    employees: employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeCode: e.employeeCode,
      department: e.department,
      paid30: e.paidBreak30,
      role: e.role,        // ✅ REAL ROLE
      isActive: e.isActive,
    })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const employeeCode = String(body.employeeCode ?? "").trim();
    const department = normalizeDepartment(body.department);
    const role = normalizeRole(body.role); // ✅ READ ROLE

    const paidBreak30 =
      body.paidBreak30 !== undefined ? Boolean(body.paidBreak30) : Boolean(body.paid30);

    if (!firstName || !lastName || employeeCode.length < 4) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    if (!/^\d+$/.test(employeeCode)) {
      return NextResponse.json({ error: "Employee code must be numeric" }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({
      where: { employeeCode },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }

    const companyId = await getCompanyId();

    const created = await prisma.employee.create({
      data: {
        companyId,
        firstName,
        lastName,
        employeeCode,
        department,
        role,               // ✅ STORE ROLE
        paidBreak30,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        department: true,
        role: true,         // ✅ RETURN ROLE
        paidBreak30: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        employee: {
          ...created,
          paid30: created.paidBreak30,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
