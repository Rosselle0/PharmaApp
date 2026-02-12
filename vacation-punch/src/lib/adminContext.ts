import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

export async function getDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  return company.id;
}

export async function getPrivilegedContextOrRedirect() {
  const auth = await requirePrivilegedOrRedirect();

  const defaultCompanyId = await getDefaultCompanyId();
  const companyIds = Array.from(new Set([auth.companyId, defaultCompanyId]));

  return {
    adminUserId: auth.userId, // MANAGER also has a real userId
    companyIds,
    role: auth.role,
  };
}
