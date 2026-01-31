// src/app/api/kiosk/unlock/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDefaultCompany() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  return (
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }))
  );
}

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));

  // numeric only, max 10 digits
  const clean = String(code ?? "").replace(/\D/g, "").slice(0, 10);
  if (!clean) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  const company = await getDefaultCompany();

  const employee = await prisma.employee.findFirst({
    where: {
      companyId: company.id,
      employeeCode: clean,
      isActive: true,
    },
    select: {
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  });

  if (!employee) {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
  }

  const exp = Date.now() + 1000 * 60 * 60 * 8; // 8 hours

  const res = NextResponse.json({
    ok: true,
    employee: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeCode: employee.employeeCode,
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
    },
  });

  // unlock cookie
  res.cookies.set("kiosk_unlock_exp", String(exp), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // store code too (still useful)
  res.cookies.set("kiosk_code", clean, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
