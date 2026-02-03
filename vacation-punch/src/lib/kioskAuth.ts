import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function requireKioskManagerOrAdmin() {
  const c = await cookies();

  const expRaw = c.get("kiosk_unlock_exp")?.value ?? "";
  const role = c.get("kiosk_role")?.value ?? "";
  const code = c.get("kiosk_code")?.value ?? "";

  const exp = Number(expRaw);
  if (!exp || Date.now() > exp) return { ok: false as const };

  if (role !== "ADMIN" && role !== "MANAGER") return { ok: false as const };

  // Optional hard-check: make sure employee still active
  if (!code) return { ok: false as const };

  const employee = await prisma.employee.findFirst({
    where: { employeeCode: code, isActive: true },
    select: { id: true },
  });

  if (!employee) return { ok: false as const };

  return { ok: true as const, role };
}
