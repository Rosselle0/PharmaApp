export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";


export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const authUser = data.user;

  // MVP: auto-create a company for first-time users (you can replace later with “invite only”)
  let appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    include: { company: true },
  });

  if (!appUser) {
    const email = authUser.email ?? "";
    // Create a default company for now (rename later from UI)
    const company = await prisma.company.create({
      data: { name: "New Company" },
    });

    appUser = await prisma.user.create({
      data: {
        authUserId: authUser.id,
        email,
        role: "ADMIN",
        companyId: company.id,
      },
      include: { company: true },
    });
  }

  return NextResponse.json({ user: appUser });
}
