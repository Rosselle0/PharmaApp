export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
  });
  if (!company) throw new Error("Company not seeded");
  return company.id;
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const authUser = data.user;
  const email = authUser.email;
  if (!email) {
    return NextResponse.json({ user: null }, { status: 400 });
  }

  const companyId = await getCompanyId();

  // ✅ FIND USER — DO NOT OVERRIDE ROLE
  let appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  });

  if (!appUser) {
    // First login only → create user as EMPLOYEE
    appUser = await prisma.user.create({
      data: {
        authUserId: authUser.id,
        email,
        name:
          (authUser.user_metadata as any)?.name ??
          (authUser.user_metadata as any)?.full_name ??
          null,
        role: "EMPLOYEE", // default ONLY once
        department: "FLOOR",
        companyId,
      },
    });
  }

  // ✅ Ensure Employee row exists (for schedules/kiosk)
  await prisma.employee.upsert({
    where: { employeeCode: appUser.authUserId },
    update: {
      isActive: true,
      department: appUser.department,
    },
    create: {
      firstName: appUser.name?.split(" ")[0] ?? "User",
      lastName: appUser.name?.split(" ").slice(1).join(" ") ?? "",
      employeeCode: appUser.authUserId,
      department: appUser.department,
      companyId,
      isActive: true,
    },
  });

  return NextResponse.json({ user: appUser });
}
