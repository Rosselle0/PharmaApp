import { describe, expect, it } from "vitest";
import { validateKioskPasswordPolicy, KIOSK_PASSWORD_REQUIREMENTS_FR } from "./kioskPasswordPolicy";

describe("validateKioskPasswordPolicy", () => {
  it("accepts valid passwords", () => {
    expect(validateKioskPasswordPolicy("abc12!xx")).toEqual({ ok: true });
    expect(validateKioskPasswordPolicy("Passw0rd#")).toEqual({ ok: true });
  });

  it("rejects short passwords", () => {
    const r = validateKioskPasswordPolicy("Ab1!");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("8");
  });

  it("rejects passwords without digit", () => {
    const r = validateKioskPasswordPolicy("Password!");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("chiffre");
  });

  it("rejects passwords without special character", () => {
    const r = validateKioskPasswordPolicy("Password1");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("spécial");
  });

  it("rejects empty or null-like", () => {
    expect(validateKioskPasswordPolicy("")).toMatchObject({ ok: false });
    expect(validateKioskPasswordPolicy("   ")).toMatchObject({ ok: false });
  });
});

describe("KIOSK_PASSWORD_REQUIREMENTS_FR", () => {
  it("is a non-empty help string", () => {
    expect(KIOSK_PASSWORD_REQUIREMENTS_FR.length).toBeGreaterThan(10);
  });
});
