import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { punchPrismaErrorUserMessage } from "./prisma";

describe("punchPrismaErrorUserMessage", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns migration hint for Unknown field errors", () => {
    expect(punchPrismaErrorUserMessage(new Error("Unknown field `foo`"))).toContain("prisma generate");
  });

  it("returns migration hint when column does not exist", () => {
    expect(
      punchPrismaErrorUserMessage(new Error('column "punchKioskLocked" does not exist'))
    ).toContain("migrate deploy");
  });

  it("returns migration hint for punchkiosklocked in message", () => {
    expect(punchPrismaErrorUserMessage(new Error("something punchkiosklocked wrong"))).toContain(
      "Mise à jour requise"
    );
  });

  it("in development returns raw message for other errors", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(punchPrismaErrorUserMessage(new Error("random failure"))).toBe(
      "Erreur serveur : random failure"
    );
  });

  it("in production returns generic message for other errors", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(punchPrismaErrorUserMessage(new Error("random failure"))).toBe(
      "Erreur serveur (pointage)."
    );
  });
});
