export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";
import {
  createEmailChangeToken,
  hashOtp,
  maskEmail,
  normalizeEmail,
} from "@/lib/emailOtp";
import { sendEmailOtp } from "@/lib/mailer";

function otpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: string; code?: string }
      | null;
    const email = normalizeEmail(body?.email);
    const code = String(body?.code ?? "").replace(/\D/g, "");

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email invalide." }, { status: 400 });
    }

    const auth = await requireEmployeeFromKioskOrCodeValue(code);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: auth.employeeId },
      select: { id: true, email: true, firstName: true },
    });
    if (!employee) {
      return NextResponse.json({ ok: false, error: "Employé introuvable." }, { status: 404 });
    }

    if ((employee.email ?? "").toLowerCase() === email) {
      return NextResponse.json(
        { ok: false, error: "Cet email est deja utilise sur ce compte." },
        { status: 400 }
      );
    }

    const existing = await prisma.employee.findFirst({
      where: { email, id: { not: employee.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: false, error: "Email deja utilise." }, { status: 409 });
    }

    const otp = otpCode();
    const expMs = Date.now() + 10 * 60 * 1000;
    const token = createEmailChangeToken({
      employeeId: employee.id,
      newEmail: email,
      codeHash: hashOtp(otp),
      exp: expMs,
    });

    const sent = await sendEmailOtp({
      to: email,
      code: otp,
      firstName: employee.firstName,
      purpose: "EMAIL_CHANGE",
    });
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 503 });
    }

    const res = NextResponse.json({
      ok: true,
      message: `Code envoye a ${maskEmail(email)}.`,
      expiresInSeconds: 600,
    });

    res.cookies.set("email_change_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(expMs),
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erreur serveur." },
      { status: 500 }
    );
  }
}
