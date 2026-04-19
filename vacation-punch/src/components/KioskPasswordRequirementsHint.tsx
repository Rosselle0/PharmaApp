"use client";

import { KIOSK_PASSWORD_REQUIREMENTS_FR } from "@/lib/kioskPasswordPolicy";

type Props = {
  id: string;
};

/** Small (? ) control with accessible tooltip for kiosk password rules. */
export function KioskPasswordRequirementsHint({ id }: Props) {
  return (
    <span className="kiosk-pw-hintWrap">
      <button
        type="button"
        className="kiosk-pw-hintBtn"
        aria-label="Exigences du mot de passe"
        aria-describedby={id}
      >
        ?
      </button>
      <span id={id} role="tooltip" className="kiosk-pw-hintPopover">
        {KIOSK_PASSWORD_REQUIREMENTS_FR}
      </span>
    </span>
  );
}
