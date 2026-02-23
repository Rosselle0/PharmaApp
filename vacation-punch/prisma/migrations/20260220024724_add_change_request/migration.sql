-- CreateEnum
CREATE TYPE "ShiftChangeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ShiftChangeRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "candidateEmployeeId" TEXT NOT NULL,
    "status" "ShiftChangeStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ShiftChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_companyId_createdAt_idx" ON "ShiftChangeRequest"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_candidateEmployeeId_status_idx" ON "ShiftChangeRequest"("candidateEmployeeId", "status");

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_requesterEmployeeId_status_idx" ON "ShiftChangeRequest"("requesterEmployeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftChangeRequest_shiftId_candidateEmployeeId_key" ON "ShiftChangeRequest"("shiftId", "candidateEmployeeId");

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_candidateEmployeeId_fkey" FOREIGN KEY ("candidateEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
