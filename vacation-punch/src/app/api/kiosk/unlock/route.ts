import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { createEmailChangeToken, hashOtp, readEmailChangeToken } from "@/lib/emailOtp";
import { sendEmailOtp } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_HOURS = 8;

async function getDefaultCompany() {
  const companyName = (process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning");
  return prisma.company.upsert({
    where: { name: companyName },
    create: { name: companyName },
    update: {},
    select: { id: true, name: true },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clean = String(body?.code ?? "").replace(/\D/g, "").slice(0, 10);
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (!clean) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    const company = await getDefaultCompany();

    const employee = await prisma.employee.findUnique({
      where: { employeeCode: clean },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeCode: true,
        role: true,
      },
    });

    if (!employee || !employee.isActive || employee.companyId !== company.id) {
      return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
    }

    // If account has an email, require OTP verification before creating kiosk session.
    if (employee.email) {
      const store = await cookies();
      const loginToken = store.get("kiosk_login_otp")?.value ?? "";

      // Verify mode
      if (otp.length > 0) {
        const parsed = loginToken ? readEmailChangeToken(loginToken) : null;
        if (!parsed || Date.now() > parsed.exp || parsed.employeeId !== employee.id) {
          return NextResponse.json(
            { ok: false, error: "Code expiré. Redemande un nouveau code." },
            { status: 400 }
          );
        }
        if (hashOtp(otp) !== parsed.codeHash) {
          return NextResponse.json({ ok: false, error: "Code incorrect." }, { status: 400 });
        }

        const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
        const session = await prisma.kioskSession.create({
          data: { employeeId: employee.id, expiresAt },
          select: { id: true },
        });

        const proto = req.headers.get("x-forwarded-proto") ?? "http";
        const isHttps = proto === "https";
        const secureCookie = process.env.NODE_ENV === "production" && isHttps;

        const verifiedRes = NextResponse.json({
          ok: true,
          employee: {
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeCode: employee.employeeCode,
            role: employee.role,
            fullName: `${employee.firstName} ${employee.lastName}`.trim(),
          },
        });
        verifiedRes.cookies.set("kiosk_session", String(session.id), {
          httpOnly: true,
          sameSite: "lax",
          secure: secureCookie,
          path: "/",
          expires: expiresAt,
        });
        verifiedRes.cookies.set("kiosk_login_otp", "", {
          httpOnly: true,
          sameSite: "lax",
          secure: secureCookie,
          path: "/",
          maxAge: 0,
        });
        return verifiedRes;
      }

      // Send mode
      const code6 = String(Math.floor(100000 + Math.random() * 900000));
      const expMs = Date.now() + 10 * 60 * 1000;
      const token = createEmailChangeToken({
        employeeId: employee.id,
        newEmail: employee.email,
        codeHash: hashOtp(code6),
        exp: expMs,
      });

      const sent = await sendEmailOtp({
        to: employee.email,
        code: code6,
        firstName: employee.firstName,
        subject: "Code de vérification kiosk",
        purpose: "LOGIN",
      });
      if (!sent.ok) {
        return NextResponse.json({ ok: false, error: sent.error }, { status: 503 });
      }

      const otpRes = NextResponse.json({
        ok: false,
        requiresOtp: true,
        message: "Code envoyé à votre email.",
      });
      otpRes.cookies.set("kiosk_login_otp", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(expMs),
      });
      return otpRes;
    }

    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

    const session = await prisma.kioskSession.create({
      data: { employeeId: employee.id, expiresAt },
      select: { id: true },
    });

    // Detect HTTPS properly (works behind proxies too)
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const isHttps = proto === "https";
    const secureCookie = process.env.NODE_ENV === "production" && isHttps;

    const res = NextResponse.json({
      ok: true,
      employee: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeCode,
        role: employee.role,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      },
    });

    res.cookies.set("kiosk_session", String(session.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      expires: expiresAt,
    });

    // Cleanup should never break login
    prisma.kioskSession
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});

    return res;
  } catch (err) {
    console.error("POST /api/kiosk/unlock failed:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
