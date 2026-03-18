import { PrismaClient } from "@prisma/client";

// Vercel/Serverless: avoid exhausting Postgres connection limits.
// Important: apply only in production so local dev DB behavior doesn't change.
if (process.env.NODE_ENV === "production") {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const hasPgBouncer = dbUrl.toLowerCase().includes("pgbouncer=true");
    if (!hasPgBouncer) {
      const sep = dbUrl.includes("?") ? "&" : "?";
      const hasConnLimit = /connection_limit=\d+/i.test(dbUrl);
      process.env.DATABASE_URL = `${dbUrl}${sep}pgbouncer=true${
        hasConnLimit ? "" : "&connection_limit=1"
      }`;
    }
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const effectiveDbUrl = process.env.DATABASE_URL;

// Cache PrismaClient on the global object in *all* environments.
// On Vercel, this avoids creating multiple Prisma instances/connection pools
// across concurrent serverless invocations (which can trigger MaxClients… errors).
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    datasources: effectiveDbUrl ? { db: { url: effectiveDbUrl } } : undefined,
    log: ["error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma;
