-- Restore missing migration file to match applied DB history.
ALTER TABLE "Employee"
ADD COLUMN "phone" TEXT;

CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PhoneOtp_employeeId_idx" ON "PhoneOtp"("employeeId");
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");

ALTER TABLE "PhoneOtp"
ADD CONSTRAINT "PhoneOtp_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
