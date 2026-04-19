export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";
import { hashPassword, verifyPassword } from "@/lib/passwordHash";
import { parseKioskSecondFactorMode, validateKioskSecondFactorConfig } from "@/lib/kioskSecondFactor";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";

export async function GET(req: Request) {
  try {
    const auth = await requireEmployeeFromKioskOrCode(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: auth.employeeId },
      select: {
        kioskSecondFactorMode: true,
        kioskPasswordHash: true,
        email: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Employé introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      mode: employee.kioskSecondFactorMode,
      hasPassword: !!employee.kioskPasswordHash?.length,
      hasEmail: !!(employee.email?.trim()),
    });
  } catch (e: unknown) {
    console.error("GET /api/settings/kiosk-login failed:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          code?: string;
          mode?: string;
          newPassword?: string;
          currentPassword?: string;
          clearPassword?: boolean;
        }
      | null;

    const url = new URL(req.url);
    const bodyCode = String(body?.code ?? "").replace(/\D/g, "");
    if (bodyCode) {
      url.searchParams.set("code", bodyCode);
    }

    const auth = await requireEmployeeFromKioskOrCode(new Request(url, { headers: req.headers }));
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    }

    const mode = parseKioskSecondFactorMode(body?.mode);
    if (!mode) {
      return NextResponse.json({ ok: false, error: "Mode requis ou invalide." }, { status: 400 });
    }

    const newPw = typeof body?.newPassword === "string" ? body.newPassword : "";
    const currentPw = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const clearPassword = Boolean(body?.clearPassword);

    const employee = await prisma.employee.findUnique({
      where: { id: auth.employeeId },
      select: { id: true, email: true, kioskPasswordHash: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Employé introuvable." }, { status: 404 });
    }

    let nextHash: string | null = employee.kioskPasswordHash;

    if (clearPassword) {
      if (employee.kioskPasswordHash?.length) {
        if (!currentPw || !verifyPassword(currentPw, employee.kioskPasswordHash)) {
          return NextResponse.json(
            { ok: false, error: "Mot de passe actuel incorrect." },
            { status: 401 }
          );
        }
      }
      nextHash = null;
    }

    if (newPw.length > 0) {
      const pwCheck = validateKioskPasswordPolicy(newPw);
      if (!pwCheck.ok) {
        return NextResponse.json({ ok: false, error: pwCheck.error }, { status: 400 });
      }
      if (employee.kioskPasswordHash?.length) {
        if (!currentPw || !verifyPassword(currentPw, employee.kioskPasswordHash)) {
          return NextResponse.json(
            { ok: false, error: "Mot de passe actuel incorrect." },
            { status: 401 }
          );
        }
      }
      nextHash = hashPassword(newPw);
    }

    const check = validateKioskSecondFactorConfig(employee.email, nextHash, mode);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        kioskSecondFactorMode: mode,
        kioskPasswordHash: nextHash,
      },
    });

    return NextResponse.json({
      ok: true,
      mode,
      hasPassword: !!nextHash?.length,
      hasEmail: !!(employee.email?.trim()),
    });
  } catch (e: unknown) {
    console.error("POST /api/settings/kiosk-login failed:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
