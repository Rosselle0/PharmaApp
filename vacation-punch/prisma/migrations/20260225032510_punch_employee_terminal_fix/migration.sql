/*
  Warnings:

  - The values [IN,OUT] on the enum `PunchType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `userId` on the `PunchEvent` table. All the data in the column will be lost.
  - Added the required column `employeeId` to the `PunchEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PunchType_new" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END', 'LUNCH_START', 'LUNCH_END');
ALTER TABLE "PunchEvent" ALTER COLUMN "type" TYPE "PunchType_new" USING ("type"::text::"PunchType_new");
ALTER TYPE "PunchType" RENAME TO "PunchType_old";
ALTER TYPE "PunchType_new" RENAME TO "PunchType";
DROP TYPE "PunchType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "PunchEvent" DROP CONSTRAINT "PunchEvent_userId_fkey";

-- DropIndex
DROP INDEX "PunchEvent_userId_at_idx";

-- AlterTable
ALTER TABLE "PunchEvent" DROP COLUMN "userId",
ADD COLUMN     "employeeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "PunchEvent_employeeId_at_idx" ON "PunchEvent"("employeeId", "at");

-- AddForeignKey
ALTER TABLE "PunchEvent" ADD CONSTRAINT "PunchEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
