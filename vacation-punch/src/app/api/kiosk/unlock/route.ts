import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { createEmailChangeToken, hashOtp, readEmailChangeToken } from "@/lib/emailOtp";
import { sendEmailOtp } from "@/lib/mailer";
import { verifyPassword } from "@/lib/passwordHash";
import type { Employee, KioskSecondFactorMode } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_HOURS = 8;

type EmployeeUnlock = Pick<
  Employee,
  | "id"
  | "companyId"
  | "isActive"
  | "firstName"
  | "lastName"
  | "email"
  | "employeeCode"
  | "role"
  | "kioskSecondFactorMode"
  | "kioskPasswordHash"
>;

async function getDefaultCompany() {
  const companyName = (process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning");
  return prisma.company.upsert({
    where: { name: companyName },
    create: { name: companyName },
    update: {},
    select: { id: true, name: true },
  });
}

function secureCookieFlags(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const isHttps = proto === "https";
  const secureCookie = process.env.NODE_ENV === "production" && isHttps;
  return { secureCookie, isHttps };
}

function verifyLoginOtpFromCookie(
  loginToken: string | undefined,
  employeeId: string,
  otp: string
): boolean {
  const parsed = loginToken ? readEmailChangeToken(loginToken) : null;
  if (!parsed || Date.now() > parsed.exp || parsed.employeeId !== employeeId) {
    return false;
  }
  return hashOtp(otp) === parsed.codeHash;
}

async function issueSession(req: Request, employee: EmployeeUnlock) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const session = await prisma.kioskSession.create({
    data: { employeeId: employee.id, expiresAt },
    select: { id: true },
  });

  const { secureCookie } = secureCookieFlags(req);

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
  res.cookies.set("kiosk_login_otp", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 0,
  });

  prisma.kioskSession
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  return res;
}

async function sendLoginOtpResponse(req: Request, employee: EmployeeUnlock, flags: { combined: boolean }) {
  const email = employee.email!.trim();
  const code6 = String(Math.floor(100000 + Math.random() * 900000));
  const expMs = Date.now() + 10 * 60 * 1000;
  const token = createEmailChangeToken({
    employeeId: employee.id,
    newEmail: email,
    codeHash: hashOtp(code6),
    exp: expMs,
  });

  const sent = await sendEmailOtp({
    to: email,
    code: code6,
    firstName: employee.firstName,
    subject: "Code de vérification kiosk",
    purpose: "LOGIN",
  });
  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error }, { status: 503 });
  }

  const { secureCookie } = secureCookieFlags(req);
  const body = flags.combined
    ? {
        ok: false,
        requiresOtpAndPassword: true,
        message: "Code envoyé à votre email. Entrez le code et votre mot de passe.",
      }
    : { ok: false, requiresOtp: true, message: "Code envoyé à votre email." };

  const otpRes = NextResponse.json(body);
  otpRes.cookies.set("kiosk_login_otp", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expMs),
  });
  return otpRes;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clean = String(body?.code ?? "").replace(/\D/g, "").slice(0, 10);
    const otp = String(body?.otp ?? "").replace(/\D/g, "");
    const password = typeof body?.password === "string" ? body.password : "";
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
        kioskSecondFactorMode: true,
        kioskPasswordHash: true,
      },
    });

    if (!employee || !employee.isActive || employee.companyId !== company.id) {
      return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
    }

    const store = await cookies();
    const loginToken = store.get("kiosk_login_otp")?.value;
    const mode = employee.kioskSecondFactorMode as KioskSecondFactorMode;
    const hasEmail = !!(employee.email?.trim());
    const hasPw = !!employee.kioskPasswordHash?.length;

    const otpProvided = otp.length > 0;
    const passwordProvided = password.length > 0;

    switch (mode) {
      case "EMAIL_OTP": {
        if (!hasEmail) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Ajoutez un email dans Paramètres ou passez au mode « Mot de passe » pour vous connecter au kiosque.",
            },
            { status: 503 }
          );
        }
        if (otpProvided) {
          if (!verifyLoginOtpFromCookie(loginToken, employee.id, otp)) {
            return NextResponse.json(
              { ok: false, error: "Code expiré. Redemande un nouveau code." },
              { status: 400 }
            );
          }
          return issueSession(req, employee);
        }
        return sendLoginOtpResponse(req, employee, { combined: false });
      }

      case "PASSWORD": {
        if (!hasPw) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Mot de passe kiosque non configuré. Utilisez Paramètres pour définir un mot de passe.",
            },
            { status: 503 }
          );
        }
        if (passwordProvided) {
          if (!verifyPassword(password, employee.kioskPasswordHash)) {
            return NextResponse.json({ ok: false, error: "Mot de passe incorrect." }, { status: 401 });
          }
          return issueSession(req, employee);
        }
        return NextResponse.json({ ok: false, requiresPassword: true });
      }

      case "EMAIL_AND_PASSWORD": {
        if (!hasEmail || !hasPw) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Connexion mal configurée : email et mot de passe requis (Paramètres).",
            },
            { status: 503 }
          );
        }

        if (otpProvided && passwordProvided) {
          if (!verifyLoginOtpFromCookie(loginToken, employee.id, otp)) {
            return NextResponse.json(
              { ok: false, error: "Code email incorrect ou expiré." },
              { status: 400 }
            );
          }
          if (!verifyPassword(password, employee.kioskPasswordHash)) {
            return NextResponse.json({ ok: false, error: "Mot de passe incorrect." }, { status: 401 });
          }
          return issueSession(req, employee);
        }

        if (!otpProvided && !passwordProvided) {
          return sendLoginOtpResponse(req, employee, { combined: true });
        }

        return NextResponse.json(
          {
            ok: false,
            error: "Entrez le code reçu par email et votre mot de passe.",
          },
          { status: 400 }
        );
      }

      default:
        return NextResponse.json({ ok: false, error: "Mode kiosque inconnu." }, { status: 500 });
    }
  } catch (err) {
    console.error("POST /api/kiosk/unlock failed:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
