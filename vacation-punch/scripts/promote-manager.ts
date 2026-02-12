import { prisma } from "@/lib/prisma";

async function main() {
  const code = process.argv[2];
  if (!code) throw new Error("Usage: ts-node scripts/promote-manager.ts <employeeCode>");

  const clean = String(code).replace(/\D/g, "").slice(0, 10);

  const updated = await prisma.employee.update({
    where: { employeeCode: clean },
    data: { role: "MANAGER" },
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
