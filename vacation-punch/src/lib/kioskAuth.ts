import "server-only";

import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export type KioskAuthResult =
  | { ok: true; role: "ADMIN" | "MANAGER"; via: "supabase"; authUserId: string }
  | { ok: true; role: "ADMIN" | "MANAGER"; via: "kiosk"; employeeId: string; companyId: string }
  | { ok: false };

async function readKioskPrivilege(): Promise<{ role: "ADMIN" | "MANAGER"; employeeId: string; companyId: string } | null> {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value;
  if (!sessionId) return null;

  // session is server-trusted, cookie only stores opaque id
  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: { select: { id: true, role: true, companyId: true, isActive: true } },
    },
  });

  if (!session) return null;
  if (Date.now() >= session.expiresAt.getTime()) return null;
  if (!session.employee.isActive) return null;

  const r = session.employee.role;
  if (r === Role.ADMIN) return { role: "ADMIN", employeeId: session.employee.id, companyId: session.employee.companyId };
  if (r === Role.MANAGER) return { role: "MANAGER", employeeId: session.employee.id, companyId: session.employee.companyId };

  return null;
}

export async function requireKioskManagerOrAdmin(): Promise<KioskAuthResult> {
  // 1) Supabase admin/manager accounts (web)
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      const me = await prisma.user.findUnique({
        where: { authUserId: data.user.id },
        select: { role: true },
      });

      if (me?.role === Role.ADMIN) return { ok: true, role: "ADMIN", via: "supabase", authUserId: data.user.id };
      if (me?.role === Role.MANAGER) return { ok: true, role: "MANAGER", via: "supabase", authUserId: data.user.id };
    }
  } catch {
    // ignore
  }

  // 2) Kiosk employee-code session (Employee table)
  const kiosk = await readKioskPrivilege();
  if (kiosk) return { ok: true, role: kiosk.role, via: "kiosk", employeeId: kiosk.employeeId, companyId: kiosk.companyId };

  return { ok: false };
}
