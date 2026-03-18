import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// If you have a direct (non-pooled) connection string in Vercel env vars,
// prefer it to avoid pooler "session mode" connection exhaustion.
// Common env var names: DIRECT_URL or DATABASE_URL_DIRECT.
let effectiveDbUrl =
  process.env.DATABASE_URL_DIRECT ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

// Vercel/Serverless: avoid exhausting Postgres connection limits.
// If the env var points at a pooler (session mode), force a direct connection:
// - remove `-pooler.` from hostname (Neon-style)
// - remove `pgbouncer=true` from query params
// - always add `connection_limit=1` as a guardrail
if (process.env.NODE_ENV === "production" && effectiveDbUrl) {
  try {
    const u = new URL(effectiveDbUrl);
    const lowerHost = u.hostname.toLowerCase();

    // Neon pooled host -> direct host
    // ep-xxx-pooler.us-east-2.aws.neon.tech -> ep-xxx.us-east-2.aws.neon.tech
    if (lowerHost.includes("-pooler.")) {
      u.hostname = u.hostname.replace(/-pooler\./i, ".");
    }

    // Remove pooling hint so Prisma doesn't try to use pooler behavior.
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("pgbouncer=true");

    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.append("connection_limit", "1");
    }

    effectiveDbUrl = u.toString();
    // keep DATABASE_URL in sync too (some tooling reads it)
    process.env.DATABASE_URL = effectiveDbUrl;
  } catch {
    // If URL parsing fails, leave it as-is.
  }
}

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
