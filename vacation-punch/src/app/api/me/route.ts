export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type PrivRole = "ADMIN" | "MANAGER";
const FORCE_SUPABASE_ROLE: PrivRole =
  (process.env.SUPABASE_AUTO_ROLE as PrivRole) ?? "ADMIN";

async function getOrCreateDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
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
  if (!email) return NextResponse.json({ user: null }, { status: 400 });

  const companyId = await getOrCreateDefaultCompanyId();

  const name =
    (authUser.user_metadata as any)?.name ??
    (authUser.user_metadata as any)?.full_name ??
    null;

  // Try authUserId first
  let appUser = await prisma.user.findUnique({ where: { authUserId: authUser.id } });

  // If not found, try by email (fixes recreated supabase users)
  if (!appUser) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      appUser = await prisma.user.update({
        where: { id: byEmail.id },
        data: { authUserId: authUser.id },
      });
    }
  }

  if (!appUser) {
    appUser = await prisma.user.create({
      data: {
        authUserId: authUser.id,
        email,
        name,
        role: FORCE_SUPABASE_ROLE, // ✅ auto-privileged
        department: "FLOOR",
        companyId,
      },
    });
  } else {
    appUser = await prisma.user.update({
      where: { id: appUser.id },
      data: {
        role: FORCE_SUPABASE_ROLE, // ✅ auto-privileged
        name: appUser.name ?? name,
        companyId: appUser.companyId ?? companyId,
      },
    });
  }

  // Keep employee row existing for kiosk/schedule systems
  await prisma.employee.upsert({
    where: { employeeCode: appUser.authUserId },
    update: { isActive: true, department: appUser.department },
    create: {
      firstName: appUser.name?.split(" ")[0] ?? "User",
      lastName: appUser.name?.split(" ").slice(1).join(" ") ?? "",
      employeeCode: appUser.authUserId,
      department: appUser.department,
      companyId: appUser.companyId,
      isActive: true,
    },
  });

  return NextResponse.json({ user: appUser });
}
