import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwordHash";
import { DEFAULT_MANAGER_KIOSK_PASSWORD } from "@/lib/kioskDefaults";

async function main() {
  const code = process.argv[2];
  if (!code) throw new Error("Usage: ts-node scripts/promote-manager.ts <employeeCode>");

  const clean = String(code).replace(/\D/g, "").slice(0, 10);

  const before = await prisma.employee.findUnique({
    where: { employeeCode: clean },
    select: { kioskPasswordHash: true },
  });

  const updated = await prisma.employee.update({
    where: { employeeCode: clean },
    data: {
      role: "MANAGER",
      ...(!before?.kioskPasswordHash
        ? { kioskPasswordHash: hashPassword(DEFAULT_MANAGER_KIOSK_PASSWORD) }
        : {}),
    },
    select: { employeeCode: true, firstName: true, lastName: true, role: true },
  });

  console.log("Updated:", updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
