/*
  Warnings:

  - The values [CASH_LAB] on the enum `Department` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Department_new" AS ENUM ('CASH', 'LAB', 'FLOOR');
ALTER TABLE "Employee" ALTER COLUMN "department" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "department" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "department" TYPE "Department_new" USING ("department"::text::"Department_new");
ALTER TABLE "Employee" ALTER COLUMN "department" TYPE "Department_new" USING ("department"::text::"Department_new");
ALTER TYPE "Department" RENAME TO "Department_old";
ALTER TYPE "Department_new" RENAME TO "Department";
DROP TYPE "Department_old";
ALTER TABLE "Employee" ALTER COLUMN "department" SET DEFAULT 'FLOOR';
ALTER TABLE "User" ALTER COLUMN "department" SET DEFAULT 'FLOOR';
COMMIT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'EMPLOYEE';
