import type { KioskSecondFactorMode } from "@prisma/client";

/** Shared labels for admin + employee settings (FR). */
export const KIOSK_MODE_OPTIONS_FR: {
  value: KioskSecondFactorMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "EMAIL_OTP",
    label: "Code par email",
    hint: "Un code à 6 chiffres est envoyé à l’adresse courriel.",
  },
  {
    value: "PASSWORD",
    label: "Mot de passe",
    hint: "Après le PIN, saisie du mot de passe kiosque.",
  },
  {
    value: "EMAIL_AND_PASSWORD",
    label: "Email et mot de passe",
    hint: "Les deux sont requis après le PIN.",
  },
];
