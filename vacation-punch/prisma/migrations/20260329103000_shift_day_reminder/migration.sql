-- CreateTable
CREATE TABLE "ShiftDayReminder" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "shiftYmd" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftDayReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDayReminder_shiftId_shiftYmd_key" ON "ShiftDayReminder"("shiftId", "shiftYmd");

-- CreateIndex
CREATE INDEX "ShiftDayReminder_shiftYmd_idx" ON "ShiftDayReminder"("shiftYmd");

-- AddForeignKey
ALTER TABLE "ShiftDayReminder" ADD CONSTRAINT "ShiftDayReminder_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
