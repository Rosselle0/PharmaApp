import { PrismaClient } from "@prisma/client";

// Vercel/Serverless: avoid exhausting Postgres connection limits.
// Important: apply only in production so local dev DB behavior doesn't change.
if (process.env.NODE_ENV === "production") {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    let nextUrl = dbUrl;

    // Neon pooled connection strings typically use a `-pooler` hostname.
    // Example:
    //   ep-xxx.us-east-2.aws.neon.tech
    // becomes:
    //   ep-xxx-pooler.us-east-2.aws.neon.tech
    try {
      const u = new URL(dbUrl);
      const host = u.hostname;
      const lowerHost = host.toLowerCase();
      if (lowerHost.includes(".neon.tech") && !lowerHost.includes("-pooler.")) {
        const parts = host.split(".");
        if (parts.length >= 3) {
          const first = parts[0];
          const rest = parts.slice(1).join(".");
          u.hostname = `${first}-pooler.${rest}`;
          nextUrl = u.toString();
        }
      }
    } catch {
      // ignore URL parsing issues; fall back to query param rewrite below
    }

    const hasPgBouncer = nextUrl.toLowerCase().includes("pgbouncer=true");
    const hasConnLimit = /connection_limit=\d+/i.test(nextUrl);
    const sep = nextUrl.includes("?") ? "&" : "?";

    // Ensure Prisma is in a mode compatible with external pooling and keep pool size tiny.
    const ensureParams: string[] = [];
    if (!hasPgBouncer) ensureParams.push("pgbouncer=true");
    if (!hasConnLimit) ensureParams.push("connection_limit=1");

    if (ensureParams.length > 0) {
      nextUrl = `${nextUrl}${sep}${ensureParams.join("&")}`;
    }

    process.env.DATABASE_URL = nextUrl;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// If you have a direct (non-pooled) connection string in Vercel env vars,
// prefer it to avoid pooler "session mode" connection exhaustion.
// Common env var names: DIRECT_URL or DATABASE_URL_DIRECT.
const effectiveDbUrl =
  process.env.DATABASE_URL_DIRECT ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

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
