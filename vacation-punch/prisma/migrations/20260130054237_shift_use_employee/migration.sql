/*
  Warnings:

  - You are about to drop the column `userId` on the `Shift` table. All the data in the column will be lost.
  - Added the required column `employeeId` to the `Shift` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_userId_fkey";

-- DropIndex
DROP INDEX "Shift_userId_startTime_idx";

-- AlterTable
ALTER TABLE "Shift" DROP COLUMN "userId",
ADD COLUMN     "employeeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Shift_employeeId_startTime_idx" ON "Shift"("employeeId", "startTime");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
