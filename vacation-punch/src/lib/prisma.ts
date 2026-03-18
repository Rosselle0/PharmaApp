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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({   
    datasources: effectiveDbUrl ? { db: { url: effectiveDbUrl } } : undefined,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
