-- CreateTable
CREATE TABLE "KioskTerminal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KioskTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskTerminalSession" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskTerminalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KioskTerminal_companyId_idx" ON "KioskTerminal"("companyId");

-- CreateIndex
CREATE INDEX "KioskTerminalSession_terminalId_idx" ON "KioskTerminalSession"("terminalId");

-- CreateIndex
CREATE INDEX "KioskTerminalSession_expiresAt_idx" ON "KioskTerminalSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "KioskTerminal" ADD CONSTRAINT "KioskTerminal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskTerminalSession" ADD CONSTRAINT "KioskTerminalSession_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "KioskTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
