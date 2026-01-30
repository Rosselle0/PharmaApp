export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role, Department } from "@prisma/client";

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
    return NextResponse.json(
      { user: null, error: "Auth user has no email" },
      { status: 400 }
    );
  }

  // 1) Find existing app user
  let appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    include: { company: true },
  });

  // 2) If missing, create it (ONE default company, not one per user)
  if (!appUser) {
    const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";

    const company =
      (await prisma.company.findFirst({ where: { name: companyName } })) ??
      (await prisma.company.create({ data: { name: companyName } }));

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
        companyId: company.id,
      },
      include: { company: true },
    });
  }

  return NextResponse.json({ user: appUser });
}
