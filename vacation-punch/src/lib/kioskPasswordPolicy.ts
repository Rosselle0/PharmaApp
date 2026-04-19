/** Kiosk second-factor password rules (aligned across admin API, settings, and UI). */

const HAS_DIGIT = /\d/;
/** Non-letter, non-digit (punctuation, symbols, etc.) */
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export function validateKioskPasswordPolicy(
  pw: string
): { ok: true } | { ok: false; error: string } {
  const s = String(pw ?? "");
  if (s.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (!HAS_DIGIT.test(s)) {
    return { ok: false, error: "Le mot de passe doit contenir au moins un chiffre." };
  }
  if (!HAS_SPECIAL.test(s)) {
    return { ok: false, error: "Le mot de passe doit contenir au moins un caractère spécial." };
  }
  return { ok: true };
}

export const KIOSK_PASSWORD_REQUIREMENTS_FR =
  "Au moins 8 caractères, au moins 1 chiffre et au moins 1 caractère spécial (ex. ! ? @ #).";
