// src/app/api/kiosk/unlock/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_HOURS = 8;

async function getDefaultCompany() {
  const companyName = (process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning");

  // Requires Company.name @unique
  return prisma.company.upsert({
    where: { name: companyName },
    create: { name: companyName },
    update: {},
    select: { id: true, name: true },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clean = String(body?.code ?? "").replace(/\D/g, "").slice(0, 10);

  if (!clean) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  const company = await getDefaultCompany();

  // employeeCode is @unique in your schema → use findUnique
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

  // must match company + active
  if (!employee || !employee.isActive || employee.companyId !== company.id) {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
  }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  // Create server-side kiosk session (SECURE)
  const session = await prisma.kioskSession.create({
    data: { employeeId: employee.id, expiresAt },
    select: { id: true },
  });

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

  // Only store session id in cookie (NOT role)
  res.cookies.set("kiosk_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Optional: keep code cookie if you use it on server
 // res.cookies.set("kiosk_code", clean, {
  //  httpOnly: true,
 //   sameSite: "lax",
  //  secure: process.env.NODE_ENV === "production",
  //  path: "/",
  //  expires: expiresAt,
//  });
await prisma.kioskSession.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});

  return res;
}
