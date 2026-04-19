export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department, Role } from "@prisma/client";
import { getCompanyId } from "@/lib/company";
import { hashPassword } from "@/lib/passwordHash";
import { DEFAULT_MANAGER_KIOSK_PASSWORD } from "@/lib/kioskDefaults";
import type { KioskSecondFactorMode } from "@prisma/client";
import { parseKioskSecondFactorMode, validateKioskSecondFactorConfig } from "@/lib/kioskSecondFactor";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";
import { messageFromUnknown } from "@/lib/unknownError";

function normalizeDepartment(dep: unknown): Department {
  const v = String(dep ?? "").toUpperCase();
  if (v === "CASH") return Department.CASH;
  if (v === "LAB") return Department.LAB;
  if (v === "FLOOR") return Department.FLOOR;
  return Department.FLOOR;
}

function normalizeRole(role: unknown): Role {
  const v = String(role ?? "").toUpperCase();
  if (v === "ADMIN") return Role.ADMIN;
  if (v === "MANAGER") return Role.MANAGER;
  return Role.EMPLOYEE;
}

function normalizeEmail(email: unknown): string | null {
  const raw = String(email ?? "").trim().toLowerCase();
  if (!raw) return null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  return ok ? raw : null;
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
      email: true,
      employeeCode: true,
      department: true,
      role: true,          // ✅ ADD THIS
      paidBreak30: true,
      isActive: true,
      kioskSecondFactorMode: true,
      kioskPasswordHash: true,
    },
  });

  return NextResponse.json({
    employees: employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      employeeCode: e.employeeCode,
      department: e.department,
      paid30: e.paidBreak30,
      role: e.role,        // ✅ REAL ROLE
      isActive: e.isActive,
      kioskSecondFactorMode: e.kioskSecondFactorMode,
      hasKioskPassword: !!e.kioskPasswordHash?.length,
    })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const employeeCode = String(body.employeeCode ?? "").trim();
    const email = normalizeEmail(body.email);
    const department = normalizeDepartment(body.department);
    const role = normalizeRole(body.role); // ✅ READ ROLE

    const paidBreak30 =
      body.paidBreak30 !== undefined ? Boolean(body.paidBreak30) : Boolean(body.paid30);

    if (!firstName || !lastName || employeeCode.length < 4) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (String(body.email ?? "").trim() && !email) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
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

    const clearKiosk = Boolean(body.clearKioskPassword);
    const explicitPw = typeof body.kioskPassword === "string" ? String(body.kioskPassword).trim() : "";
    let nextHash: string | null = null;
    if (clearKiosk) {
      nextHash = null;
    } else if (explicitPw.length > 0) {
      const pwCheck = validateKioskPasswordPolicy(explicitPw);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 });
      }
      nextHash = hashPassword(explicitPw);
    } else if (role === Role.MANAGER) {
      nextHash = hashPassword(DEFAULT_MANAGER_KIOSK_PASSWORD);
    }

    const parsedMode = parseKioskSecondFactorMode(body.kioskSecondFactorMode);
    const mode: KioskSecondFactorMode =
      parsedMode ?? (email ? "EMAIL_OTP" : nextHash ? "PASSWORD" : "EMAIL_OTP");

    const cfg = validateKioskSecondFactorConfig(email, nextHash, mode);
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 400 });
    }

    const created = await prisma.employee.create({
      data: {
        companyId,
        firstName,
        lastName,
        email,
        employeeCode,
        department,
        role,               // ✅ STORE ROLE
        paidBreak30,
        isActive: true,
        kioskSecondFactorMode: mode,
        kioskPasswordHash: nextHash,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeCode: true,
        department: true,
        role: true,         // ✅ RETURN ROLE
        paidBreak30: true,
        isActive: true,
        createdAt: true,
        kioskSecondFactorMode: true,
        kioskPasswordHash: true,
      },
    });

    return NextResponse.json(
      {
        employee: {
          id: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          email: created.email,
          employeeCode: created.employeeCode,
          department: created.department,
          role: created.role,
          paid30: created.paidBreak30,
          isActive: created.isActive,
          createdAt: created.createdAt,
          kioskSecondFactorMode: created.kioskSecondFactorMode,
          hasKioskPassword: !!created.kioskPasswordHash?.length,
        },
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "Employee code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: messageFromUnknown(e) || "Server error" }, { status: 500 });
  }
}
