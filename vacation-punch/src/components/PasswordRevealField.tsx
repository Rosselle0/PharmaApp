"use client";

import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import "./PasswordRevealField.css";

function IconEyeVisible() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconEyeHidden() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"
      />
    </svg>
  );
}

export type PasswordRevealFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes on the inner input (e.g. email-change-input, kiosk-auth-input) */
  inputClassName?: string;
  wrapClassName?: string;
};

/**
 * Password field with a side toggle: masked by default, click the eye to show what you type.
 */
export function PasswordRevealField({
  inputClassName,
  wrapClassName,
  className,
  disabled,
  id,
  ...rest
}: PasswordRevealFieldProps) {
  const [visible, setVisible] = useState(false);
  const genId = useId();
  const inputId = id ?? genId;

  const inputClasses = [inputClassName, className].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["pwReveal-wrap", wrapClassName].filter(Boolean).join(" ")}>
      <input
        {...rest}
        id={inputId}
        type={visible ? "text" : "password"}
        className={inputClasses}
        disabled={disabled}
        autoComplete={rest.autoComplete}
      />
      <button
        type="button"
        className="pwReveal-toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        aria-controls={inputId}
      >
        {visible ? <IconEyeVisible /> : <IconEyeHidden />}
      </button>
    </div>
  );
}
