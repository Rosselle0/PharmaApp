import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { Role } from "@prisma/client";

export async function getDefaultCompanyId() {
  const name = (process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning");
  const company = await prisma.company.upsert({
    where: { name },
    create: { name },
    update: {},
    select: { id: true },
  });
  return company.id;
}

export async function getAdminContextOrRedirect() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) redirect("/kiosk?reason=no_supabase_user");

  const user = data.user;
  const email = user.email;
  if (!email) redirect("/kiosk?reason=no_email");

  const companyId = await getDefaultCompanyId();

  const name =
    (user.user_metadata as any)?.name ??
    (user.user_metadata as any)?.full_name ??
    null;

  // SLEDGEHAMMER: any Supabase user is ADMIN in Prisma (creates row if missing)
  const me = await prisma.user.upsert({
    where: { authUserId: user.id },
    create: {
      authUserId: user.id,
      email,
      name,
      role: Role.ADMIN,
      department: "FLOOR",
      companyId,
    },
    update: {
      email,
      name: name ?? undefined,
      role: Role.ADMIN,
      companyId,
    },
    select: { id: true, role: true, companyId: true },
  });

  // Allowed by definition now, but keep sanity anyway
  if (me.role !== Role.ADMIN && me.role !== Role.MANAGER) {
    redirect("/kiosk?reason=role_denied");
  }

  const defaultCompanyId = companyId;
  const companyIds = Array.from(new Set([me.companyId, defaultCompanyId].filter(Boolean)));

  return { adminUserId: me.id, companyIds, role: me.role };
}
