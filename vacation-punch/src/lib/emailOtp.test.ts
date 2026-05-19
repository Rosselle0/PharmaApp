import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createEmailChangeToken,
  hashOtp,
  maskEmail,
  normalizeEmail,
  readEmailChangeToken,
} from "./emailOtp";

describe("hashOtp", () => {
  it("is deterministic sha256 hex", () => {
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
    expect(hashOtp("123456")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases valid emails", () => {
    expect(normalizeEmail("  User@EXAMPLE.com ")).toBe("user@example.com");
  });

  it("returns null for invalid or empty", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("missing@domain")).toBeNull();
  });
});

describe("maskEmail", () => {
  it("masks local part keeping domain", () => {
    expect(maskEmail("ab@example.com")).toBe("ab*@example.com");
    expect(maskEmail("ross@pharma.ca")).toMatch(/^ro\*+@pharma\.ca$/);
  });

  it("returns input when malformed", () => {
    expect(maskEmail("no-at")).toBe("no-at");
  });
});

describe("email change token", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_CHANGE_SECRET", "unit-test-secret-key-32chars!!");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("round-trips payload", () => {
    const payload = {
      employeeId: "emp-1",
      newEmail: "new@example.com",
      codeHash: hashOtp("999999"),
      exp: Date.now() + 60_000,
    };
    const token = createEmailChangeToken(payload);
    expect(readEmailChangeToken(token)).toEqual(payload);
  });

  it("returns null when signature is wrong", () => {
    const token = createEmailChangeToken({
      employeeId: "e",
      newEmail: "a@b.co",
      codeHash: "h",
      exp: 1,
    });
    const [body, sig] = token.split(".");
    const tampered = `${body.slice(0, -1)}X.${sig}`;
    expect(readEmailChangeToken(tampered)).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(readEmailChangeToken("not-a-token")).toBeNull();
    expect(readEmailChangeToken("onlyonepart")).toBeNull();
  });
});
