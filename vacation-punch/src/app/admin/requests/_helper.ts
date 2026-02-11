import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { Role } from "@prisma/client";


export async function getDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  return company.id;
}

export async function getAdminContextOrRedirect() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/kiosk");

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { id: true, role: true, companyId: true },
  });

  if (!me) redirect("/kiosk");

  // ✅ ADMIN OR MANAGER
  const allowed = me.role === Role.ADMIN || me.role === Role.MANAGER;
  if (!allowed) redirect("/kiosk");

  const defaultCompanyId = await getDefaultCompanyId();

  const companyIds = Array.from(
    new Set([me.companyId, defaultCompanyId].filter(Boolean) as string[])
  );

  return { adminUserId: me.id, companyIds, role: me.role };
}
