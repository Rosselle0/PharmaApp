export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role, Department } from "@prisma/client";

// 🔒 single source of truth for company
async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
  });

  if (!company) {
    throw new Error("Company not seeded");
  }

  return company.id;
}

function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(email.toLowerCase());
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

  // 1️⃣ Find or create User
  let appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  });

  if (!appUser) {
    const role = isAdminEmail(email) ? Role.ADMIN : Role.EMPLOYEE;

    appUser = await prisma.user.create({
      data: {
        authUserId: authUser.id,
        email,
        name:
          (authUser.user_metadata as any)?.name ??
          (authUser.user_metadata as any)?.full_name ??
          null,
        role,
        department: Department.FLOOR,
        companyId,
      },
    });
  }

  // 2️⃣ Ensure Employee exists (THIS is what fixes schedule)
  await prisma.employee.upsert({
    where: { employeeCode: appUser.authUserId },
    update: { isActive: true },
    create: {
      firstName: appUser.name?.split(" ")[0] ?? "Admin",
      lastName: appUser.name?.split(" ").slice(1).join(" ") ?? "",
      employeeCode: appUser.authUserId,
      department: appUser.department,
      companyId,
      isActive: true,
    },
  });

  return NextResponse.json({ user: appUser });
}
