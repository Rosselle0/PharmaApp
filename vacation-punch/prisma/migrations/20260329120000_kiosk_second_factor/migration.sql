-- CreateEnum
CREATE TYPE "KioskSecondFactorMode" AS ENUM ('NONE', 'EMAIL_OTP', 'PASSWORD', 'EMAIL_OR_PASSWORD', 'EMAIL_AND_PASSWORD');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "kioskSecondFactorMode" "KioskSecondFactorMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Employee" ADD COLUMN "kioskPasswordHash" TEXT;

-- Preserve previous behaviour: employees with an email used email OTP; others had PIN-only.
UPDATE "Employee"
SET "kioskSecondFactorMode" = 'EMAIL_OTP'
WHERE "email" IS NOT NULL AND TRIM("email") <> '';
