-- Remove EMAIL_OR_PASSWORD from KioskSecondFactorMode (remap rows first).

UPDATE "Employee"
SET "kioskSecondFactorMode" = 'EMAIL_AND_PASSWORD'::"KioskSecondFactorMode"
WHERE "kioskSecondFactorMode"::text = 'EMAIL_OR_PASSWORD'
  AND "email" IS NOT NULL
  AND TRIM("email") <> ''
  AND "kioskPasswordHash" IS NOT NULL
  AND LENGTH(TRIM("kioskPasswordHash")) > 0;

UPDATE "Employee"
SET "kioskSecondFactorMode" = 'EMAIL_OTP'::"KioskSecondFactorMode"
WHERE "kioskSecondFactorMode"::text = 'EMAIL_OR_PASSWORD'
  AND "email" IS NOT NULL
  AND TRIM("email") <> '';

UPDATE "Employee"
SET "kioskSecondFactorMode" = 'PASSWORD'::"KioskSecondFactorMode"
WHERE "kioskSecondFactorMode"::text = 'EMAIL_OR_PASSWORD';

CREATE TYPE "KioskSecondFactorMode_new" AS ENUM ('EMAIL_OTP', 'PASSWORD', 'EMAIL_AND_PASSWORD');

ALTER TABLE "Employee" ALTER COLUMN "kioskSecondFactorMode" DROP DEFAULT;

ALTER TABLE "Employee"
  ALTER COLUMN "kioskSecondFactorMode" TYPE "KioskSecondFactorMode_new"
  USING ("kioskSecondFactorMode"::text::"KioskSecondFactorMode_new");

DROP TYPE "KioskSecondFactorMode";

ALTER TYPE "KioskSecondFactorMode_new" RENAME TO "KioskSecondFactorMode";

ALTER TABLE "Employee"
  ALTER COLUMN "kioskSecondFactorMode" SET DEFAULT 'EMAIL_OTP'::"KioskSecondFactorMode";
