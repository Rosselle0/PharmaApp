const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const lateOvertimeActions = [
    "LATE_ACCEPTED",
    "LATE_REJECTED",
    "LATE_REVIEWED",
    "OVERTIME_ACCEPTED",
    "OVERTIME_REJECTED",
    "OVERTIME_REVIEWED",
    "OVERTIME_ACCEPTED_BY_PHARMACIST",
  ];

  const [shift, punch, shiftChangeRequest, auditLog] = await Promise.all([
    prisma.shift.count(),
    prisma.punchEvent.count(),
    prisma.shiftChangeRequest.count(),
    prisma.auditLog.count({
      where: { action: { in: lateOvertimeActions } },
    }),
  ]);

  console.log({ shift, punch, shiftChangeRequest, auditLogLateOvertime: auditLog });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

