import { prisma } from "@/lib/prisma";

export async function getCompanyId() {
  const name = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";

  const company = await prisma.company.findFirst({
    where: { name },
  });

  if (!company) {
    throw new Error("Default company missing");
  }

  return company.id;
}
