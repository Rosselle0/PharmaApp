const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Late/overtime review audit actions (used by admin logs).
  const lateOvertimeActions = [
    "LATE_ACCEPTED",
    "LATE_REJECTED",
    "LATE_REVIEWED",
    "OVERTIME_ACCEPTED",
    "OVERTIME_REJECTED",
    "OVERTIME_REVIEWED",
    "OVERTIME_ACCEPTED_BY_PHARMACIST",
  ];

  // Delete order matters because:
  // - PunchEvent.shiftId can point to Shift -> so delete punches first.
  // - ShiftChangeRequest.shiftId points to Shift -> delete shift-change rows first or rely on cascade.
  // - We'll delete AuditLog first since it doesn't have strict FK constraints to Shift.
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({
      where: {
        action: { in: lateOvertimeActions },
      },
    });

    await tx.punchEvent.deleteMany({});
    await tx.shiftChangeRequest.deleteMany({});
    await tx.shift.deleteMany({});
  });

  console.log("Reset complete: Shift, PunchEvent, ShiftChangeRequest, and LATE_/OVERTIME_ audit logs.");
}

main()
  .catch((e) => {
    console.error("Reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

