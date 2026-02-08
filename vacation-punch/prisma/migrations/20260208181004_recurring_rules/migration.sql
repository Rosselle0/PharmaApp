-- CreateEnum
CREATE TYPE "ShiftSource" AS ENUM ('MANUAL', 'RECURRING');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "source" "ShiftSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "RecurringShiftRule" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHHMM" TEXT NOT NULL,
    "endHHMM" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "startsOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringShiftRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringShiftRule_employeeId_idx" ON "RecurringShiftRule"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringShiftRule_employeeId_dayOfWeek_key" ON "RecurringShiftRule"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Shift_ruleId_idx" ON "Shift"("ruleId");

-- AddForeignKey
ALTER TABLE "RecurringShiftRule" ADD CONSTRAINT "RecurringShiftRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringShiftRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
