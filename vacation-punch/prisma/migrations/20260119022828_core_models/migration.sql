/*
  Warnings:

  - You are about to drop the `TimePunch` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `VacationRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('VACATION', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('PLANNED', 'ON_LEAVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('IN', 'OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "PunchSource" AS ENUM ('MOBILE', 'WEB', 'ADMIN');

-- DropForeignKey
ALTER TABLE "TimePunch" DROP CONSTRAINT "TimePunch_userId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "meta" JSONB,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- AlterTable
ALTER TABLE "VacationRequest" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "TimePunch";

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" "TimeOffType" NOT NULL DEFAULT 'VACATION',
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT,
    "type" "PunchType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" "PunchSource" NOT NULL DEFAULT 'MOBILE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeOff_requestId_key" ON "TimeOff"("requestId");

-- CreateIndex
CREATE INDEX "TimeOff_userId_startDate_idx" ON "TimeOff"("userId", "startDate");

-- CreateIndex
CREATE INDEX "TimeOff_startDate_endDate_idx" ON "TimeOff"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Shift_userId_startTime_idx" ON "Shift"("userId", "startTime");

-- CreateIndex
CREATE INDEX "Shift_startTime_endTime_idx" ON "Shift"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "PunchEvent_userId_at_idx" ON "PunchEvent"("userId", "at");

-- CreateIndex
CREATE INDEX "PunchEvent_shiftId_idx" ON "PunchEvent"("shiftId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "VacationRequest_userId_status_idx" ON "VacationRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "VacationRequest_startDate_endDate_idx" ON "VacationRequest"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VacationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchEvent" ADD CONSTRAINT "PunchEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchEvent" ADD CONSTRAINT "PunchEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
