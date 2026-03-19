import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type KioskEmployeeSession = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  companyId: string;
  role: string;
  isActive: boolean;
};

export async function getKioskEmployeeFromSession(): Promise<KioskEmployeeSession | null> {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value;
  if (!sessionId) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          companyId: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!session) return null;
  if (Date.now() >= session.expiresAt.getTime()) return null;
  if (!session.employee?.isActive) return null;

  return {
    id: session.employee.id,
    employeeCode: session.employee.employeeCode,
    firstName: session.employee.firstName,
    lastName: session.employee.lastName,
    companyId: session.employee.companyId,
    role: String(session.employee.role ?? "EMPLOYEE"),
    isActive: Boolean(session.employee.isActive),
  };
}

