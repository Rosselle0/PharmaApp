/*
  Warnings:

  - You are about to drop the column `userId` on the `VacationRequest` table. All the data in the column will be lost.
  - Added the required column `employeeId` to the `VacationRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "VacationStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "VacationRequest" DROP CONSTRAINT "VacationRequest_userId_fkey";

-- DropIndex
DROP INDEX "VacationRequest_userId_status_idx";

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "vacationRequestId" TEXT;

-- AlterTable
ALTER TABLE "VacationRequest" DROP COLUMN "userId",
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedByUserId" TEXT,
ADD COLUMN     "employeeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "VacationRequest_employeeId_status_idx" ON "VacationRequest"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_vacationRequestId_fkey" FOREIGN KEY ("vacationRequestId") REFERENCES "VacationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
