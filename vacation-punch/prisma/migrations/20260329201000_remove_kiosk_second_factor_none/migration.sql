-- Remove NONE from KioskSecondFactorMode (always require a second factor: email and/or password).

UPDATE "Employee"
SET "kioskSecondFactorMode" = 'EMAIL_OTP'::"KioskSecondFactorMode"
WHERE "kioskSecondFactorMode"::text = 'NONE'
  AND "email" IS NOT NULL
  AND TRIM("email") <> '';

UPDATE "Employee"
SET "kioskSecondFactorMode" = 'PASSWORD'::"KioskSecondFactorMode"
WHERE "kioskSecondFactorMode"::text = 'NONE'
  AND ("email" IS NULL OR TRIM("email") = '');

CREATE TYPE "KioskSecondFactorMode_new" AS ENUM ('EMAIL_OTP', 'PASSWORD', 'EMAIL_OR_PASSWORD', 'EMAIL_AND_PASSWORD');

ALTER TABLE "Employee" ALTER COLUMN "kioskSecondFactorMode" DROP DEFAULT;

ALTER TABLE "Employee"
  ALTER COLUMN "kioskSecondFactorMode" TYPE "KioskSecondFactorMode_new"
  USING ("kioskSecondFactorMode"::text::"KioskSecondFactorMode_new");

DROP TYPE "KioskSecondFactorMode";

ALTER TYPE "KioskSecondFactorMode_new" RENAME TO "KioskSecondFactorMode";

ALTER TABLE "Employee"
  ALTER COLUMN "kioskSecondFactorMode" SET DEFAULT 'EMAIL_OTP'::"KioskSecondFactorMode";
