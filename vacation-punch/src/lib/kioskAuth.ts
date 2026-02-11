import "server-only";

import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export type KioskAuthResult =
  | { ok: true; role: "ADMIN" | "MANAGER"; via: "supabase" | "kiosk" }
  | { ok: false };

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

export async function requireKioskManagerOrAdmin(): Promise<KioskAuthResult> {
  // 1) Supabase admin/dev accounts
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      const me = await prisma.user.findUnique({
        where: { authUserId: data.user.id },
        select: { role: true },
      });

      if (me?.role === Role.ADMIN) return { ok: true, role: "ADMIN", via: "supabase" };
      if (me?.role === Role.MANAGER) return { ok: true, role: "MANAGER", via: "supabase" };
    }
  } catch {
    // ignore and fall back to kiosk cookies
  }

  // 2) Kiosk manager/boss PIN login
  const kioskRole = await readKioskPrivilege();
  if (kioskRole) return { ok: true, role: kioskRole, via: "kiosk" };

  return { ok: false };
}
