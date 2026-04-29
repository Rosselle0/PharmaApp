-- Add employee profile photo (data URL) for cross-device sync
ALTER TABLE "Employee"
ADD COLUMN IF NOT EXISTS "profilePhotoDataUrl" TEXT;
