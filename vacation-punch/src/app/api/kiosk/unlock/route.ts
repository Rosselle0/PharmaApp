import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        employeeCode: true,
        role: true,
      },
    });

    if (!employee || !employee.isActive || employee.companyId !== company.id) {
      return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
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
