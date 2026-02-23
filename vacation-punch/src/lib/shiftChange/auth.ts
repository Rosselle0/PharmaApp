// src/lib/shiftChange/auth.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type EmployeeAuth =
  | { ok: true; employeeId: string; companyId: string }
  | { ok: false; error: string };

async function getEmployeeFromKioskSession() {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value;
  if (!sessionId) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: { select: { id: true, companyId: true, isActive: true } },
    },
  });

  if (!session) return null;
  if (Date.now() >= session.expiresAt.getTime()) return null;
  if (!session.employee?.isActive) return null;

  return session.employee; // { id, companyId, isActive }
}

async function getEmployeeFromCode(code: string) {
  const clean = String(code).replace(/\D/g, "").slice(0, 10);
  if (!clean) return null;

  const employee = await prisma.employee.findUnique({
    where: { employeeCode: clean },
    select: { id: true, companyId: true, isActive: true },
  });

  if (!employee || !employee.isActive) return null;
  return employee;
}

export async function requireEmployeeFromKioskOrCode(req: Request): Promise<EmployeeAuth> {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim();

  const emp = (await getEmployeeFromKioskSession()) ?? (code ? await getEmployeeFromCode(code) : null);

  if (!emp) {
    return { ok: false, error: code ? "Code invalide" : "Non connecté" };
  }

  return { ok: true, employeeId: emp.id, companyId: emp.companyId };
}