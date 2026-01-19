-- CreateEnum
CREATE TYPE "Department" AS ENUM ('CASH_LAB', 'FLOOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" "Department" NOT NULL DEFAULT 'FLOOR';

-- CreateIndex
CREATE INDEX "User_companyId_department_idx" ON "User"("companyId", "department");
