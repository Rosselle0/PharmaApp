-- CreateEnum
CREATE TYPE "AttendanceReview" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'DECLINED');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "attendanceReview" "AttendanceReview" NOT NULL DEFAULT 'NONE';
