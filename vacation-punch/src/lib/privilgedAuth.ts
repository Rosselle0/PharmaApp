import "server-only";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export type PrivilegedContext = {
  via: "supabase" | "kiosk";
  role: "ADMIN" | "MANAGER";
  adminUserId: string | null;
  companyIds: string[];
};

async function getDefaultCompanyId(): Promise<string> {
  const name = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  const company =
    (await prisma.company.findFirst({ where: { name } })) ??
    (await prisma.company.create({ data: { name } }));
  return company.id;
}

async function readKioskPrivilege(): Promise<"ADMIN" | "MANAGER" | null> {
  const store = await cookies(); // ✅ your Next version needs await

  const expStr = store.get("kiosk_unlock_exp")?.value;
  if (!expStr) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() >= exp) return null;

  const roleRaw = (store.get("kiosk_role")?.value ?? "").toUpperCase();
  if (roleRaw === "ADMIN") return "ADMIN";
  if (roleRaw === "MANAGER") return "MANAGER";
  return null;
}

// ✅ Use this for pages that accept BOTH: supabase admin + kiosk manager
export async function requirePrivilegedOrRedirect(): Promise<PrivilegedContext> {
  // 1) Supabase (admin/dev)
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      const me = await prisma.user.findUnique({
        where: { authUserId: data.user.id },
        select: { id: true, role: true, companyId: true },
      });

      if (me?.role === Role.ADMIN || me?.role === Role.MANAGER) {
        const defaultCompanyId = await getDefaultCompanyId();
        const companyIds = Array.from(
          new Set([me.companyId, defaultCompanyId].filter(Boolean) as string[])
        );

        return {
          via: "supabase",
          role: me.role === Role.ADMIN ? "ADMIN" : "MANAGER",
          adminUserId: me.id,
          companyIds,
        };
      }
    }
  } catch {
    // fall through
  }

  // 2) Kiosk cookies (manager/boss PIN)
  const kioskRole = await readKioskPrivilege();
  if (kioskRole) {
    const defaultCompanyId = await getDefaultCompanyId();
    return {
      via: "kiosk",
      role: kioskRole,
      adminUserId: null,
      companyIds: [defaultCompanyId],
    };
  }

  redirect("/kiosk");
}
