export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCodeValue } from "@/lib/shiftChange/auth";
import { hashOtp, readEmailChangeToken } from "@/lib/emailOtp";
import { messageFromUnknown } from "@/lib/unknownError";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { otp?: string; code?: string }
      | null;
    const otp = String(body?.otp ?? "").replace(/\D/g, "");
    const code = String(body?.code ?? "").replace(/\D/g, "");
    if (otp.length !== 6) {
      return NextResponse.json({ ok: false, error: "Code invalide." }, { status: 400 });
    }

    const auth = await requireEmployeeFromKioskOrCodeValue(code);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("email_change_token")?.value ?? "";
    const parsed = token ? readEmailChangeToken(token) : null;
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Verification expiree. Redemande un nouveau code." },
        { status: 400 }
      );
    }

    if (Date.now() > parsed.exp) {
      return NextResponse.json(
        { ok: false, error: "Code expire. Redemande un nouveau code." },
        { status: 400 }
      );
    }
    if (parsed.employeeId !== auth.employeeId) {
      return NextResponse.json({ ok: false, error: "Session invalide." }, { status: 403 });
    }
    if (hashOtp(otp) !== parsed.codeHash) {
      return NextResponse.json({ ok: false, error: "Code incorrect." }, { status: 400 });
    }

    const conflict = await prisma.employee.findFirst({
      where: { email: parsed.newEmail, id: { not: auth.employeeId } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json({ ok: false, error: "Email deja utilise." }, { status: 409 });
    }

    const updated = await prisma.employee.update({
      where: { id: auth.employeeId },
      data: { email: parsed.newEmail },
      select: { email: true },
    });

    const res = NextResponse.json({ ok: true, email: updated.email });
    res.cookies.set("email_change_token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: messageFromUnknown(e) || "Erreur serveur." },
      { status: 500 }
    );
  }
}
