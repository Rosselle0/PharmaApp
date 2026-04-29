export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department, Role } from "@prisma/client";
import type { KioskSecondFactorMode } from "@prisma/client";
import { hashPassword } from "@/lib/passwordHash";
import { DEFAULT_MANAGER_KIOSK_PASSWORD } from "@/lib/kioskDefaults";
import { parseKioskSecondFactorMode, validateKioskSecondFactorConfig } from "@/lib/kioskSecondFactor";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";
import { messageFromUnknown } from "@/lib/unknownError";

type Ctx = { params: Promise<{ id: string }> };

function normalizeDepartment(dep: unknown): Department {
  return dep === "CASH" || dep === "LAB" || dep === "FLOOR" ? dep : Department.FLOOR;
}

function normalizeRole(role: unknown): Role {
  return role === "ADMIN" || role === "MANAGER" || role === "EMPLOYEE" ? role : Role.EMPLOYEE;
}

function normalizeEmail(email: unknown): string | null {
  const raw = String(email ?? "").trim().toLowerCase();
  if (!raw) return null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  return ok ? raw : null;
}

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const employeeCode = String(body.employeeCode ?? "").trim();
    const email = normalizeEmail(body.email);

    const department = normalizeDepartment(body.department);
    const role = normalizeRole(body.role);

    const paidBreak30 =
      body.paidBreak30 !== undefined ? Boolean(body.paidBreak30) : Boolean(body.paid30);

    if (!firstName || !lastName || employeeCode.length < 4) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!/^\d+$/.test(employeeCode)) {
      return NextResponse.json({ error: "Employee code must be numeric" }, { status: 400 });
    }
    if (String(body.email ?? "").trim() && !email) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    const existingRow = await prisma.employee.findUnique({
      where: { id },
      select: { kioskPasswordHash: true, kioskSecondFactorMode: true },
    });

    let nextHash: string | null = existingRow?.kioskPasswordHash ?? null;
    let nextMode: KioskSecondFactorMode =
      existingRow?.kioskSecondFactorMode ?? "EMAIL_OTP";

    if (body.kioskSecondFactorMode !== undefined && body.kioskSecondFactorMode !== null) {
      const p = parseKioskSecondFactorMode(body.kioskSecondFactorMode);
      if (p) nextMode = p;
    }

    const clearKiosk = Boolean(body.clearKioskPassword);
    const explicitPw =
      typeof body.kioskPassword === "string" ? String(body.kioskPassword).trim() : "";

    if (clearKiosk) {
      nextHash = null;
    } else if (explicitPw.length > 0) {
      const pwCheck = validateKioskPasswordPolicy(explicitPw);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 });
      }
      nextHash = hashPassword(explicitPw);
    } else if (role === Role.MANAGER && !nextHash) {
      nextHash = hashPassword(DEFAULT_MANAGER_KIOSK_PASSWORD);
    }

    const cfg = validateKioskSecondFactorConfig(email, nextHash, nextMode);
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 400 });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        employeeCode,
        department,
        role,
        paidBreak30,
        isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
        kioskSecondFactorMode: nextMode,
        kioskPasswordHash: nextHash,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeCode: true,
        department: true,
        role: true,
        paidBreak30: true,
        isActive: true,
        kioskSecondFactorMode: true,
        kioskPasswordHash: true,
      },
    });

    return NextResponse.json({
      employee: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        employeeCode: updated.employeeCode,
        department: updated.department,
        role: updated.role,
        paid30: updated.paidBreak30,
        isActive: updated.isActive,
        kioskSecondFactorMode: updated.kioskSecondFactorMode,
        hasKioskPassword: !!updated.kioskPasswordHash?.length,
      },
    });
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

export async function DELETE(_req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    await prisma.$transaction(async (tx) => {
      await tx.shiftChangeRequest.deleteMany({
        where: {
          OR: [{ requesterEmployeeId: id }, { candidateEmployeeId: id }],
        },
      });
      await tx.taskAssignment.deleteMany({ where: { employeeId: id } });
      await tx.punchEvent.updateMany({
        where: { shift: { employeeId: id } },
        data: { shiftId: null },
      });
      await tx.shift.deleteMany({ where: { employeeId: id } });
      await tx.recurringShiftRule.deleteMany({ where: { employeeId: id } });
      await tx.employee.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromUnknown(e) || "Server error" }, { status: 500 });
  }
}
