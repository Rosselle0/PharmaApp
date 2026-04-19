import type { KioskSecondFactorMode } from "@prisma/client";

export const KIOSK_SECOND_FACTOR_MODES: KioskSecondFactorMode[] = [
  "EMAIL_OTP",
  "PASSWORD",
  "EMAIL_AND_PASSWORD",
];

export function parseKioskSecondFactorMode(v: unknown): KioskSecondFactorMode | null {
  const s = String(v ?? "").trim();
  return KIOSK_SECOND_FACTOR_MODES.includes(s as KioskSecondFactorMode)
    ? (s as KioskSecondFactorMode)
    : null;
}

export function validateKioskSecondFactorConfig(
  email: string | null,
  hash: string | null,
  mode: KioskSecondFactorMode
): { ok: true } | { ok: false; error: string } {
  const hasEmail = !!(email?.trim());
  const hasPw = !!hash?.length;
  switch (mode) {
    case "EMAIL_OTP":
      if (!hasEmail) return { ok: false, error: "Un email est requis pour la vérification par code." };
      return { ok: true };
    case "PASSWORD":
      if (!hasPw) return { ok: false, error: "Définissez un mot de passe pour ce mode." };
      return { ok: true };
    case "EMAIL_AND_PASSWORD":
      if (!hasEmail || !hasPw) {
        return { ok: false, error: "Ce mode exige un email et un mot de passe." };
      }
      return { ok: true };
    default:
      return { ok: false, error: "Mode invalide." };
  }
}
