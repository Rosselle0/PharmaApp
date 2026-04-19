/**
 * One-off: set default kiosk password for existing MANAGER employees with no kioskPasswordHash.
 * Run from repo root: npx tsx scripts/backfill-manager-default-kiosk-password.ts
 */
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwordHash";
import { DEFAULT_MANAGER_KIOSK_PASSWORD } from "@/lib/kioskDefaults";

async function main() {
  const hash = hashPassword(DEFAULT_MANAGER_KIOSK_PASSWORD);
  const res = await prisma.employee.updateMany({
    where: { role: "MANAGER", kioskPasswordHash: null },
    data: { kioskPasswordHash: hash },
  });
  console.log(`Updated ${res.count} manager row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
