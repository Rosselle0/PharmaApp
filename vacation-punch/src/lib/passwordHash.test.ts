import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwordHash";

describe("passwordHash", () => {
  it("verifyPassword returns true for same plaintext after hash", () => {
    const stored = hashPassword("mySecret!1");
    expect(verifyPassword("mySecret!1", stored)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", () => {
    const stored = hashPassword("correct");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("verifyPassword returns false for invalid stored format", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "bcrypt$foo")).toBe(false);
    expect(verifyPassword("x", "scrypt1$bad")).toBe(false);
  });

  it("produces different hashes for same password (salt)", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a).not.toBe(b);
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });
});
