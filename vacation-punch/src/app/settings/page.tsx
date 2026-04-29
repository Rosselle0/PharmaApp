"use client";

import { useEffect, useMemo, useRef, useState, Suspense, type ChangeEvent } from "react";
import "./settings.css";
import KioskSidebar from "@/components/KioskSidebar";
import { useTheme } from "@/components/ThemeProvider";
import type { KioskSecondFactorMode } from "@prisma/client";
import { KIOSK_MODE_OPTIONS_FR } from "@/lib/kioskSecondFactorUi";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";
import { KioskPasswordRequirementsHint } from "@/components/KioskPasswordRequirementsHint";
import { PasswordRevealField } from "@/components/PasswordRevealField";
import "@/app/admin/admin-kiosk-fields.css";
import Image from "next/image";

const KIOSK_MODE_OPTIONS = KIOSK_MODE_OPTIONS_FR;

type DayKey = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

type DayAvailability = {
  day: DayKey;
  available: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  note: string;
};

const DAYS: { key: DayKey; labelFR: string }[] = [
  { key: "SUN", labelFR: "Dimanche" },
  { key: "MON", labelFR: "Lundi" },
  { key: "TUE", labelFR: "Mardi" },
  { key: "WED", labelFR: "Mercredi" },
  { key: "THU", labelFR: "Jeudi" },
  { key: "FRI", labelFR: "Vendredi" },
  { key: "SAT", labelFR: "Samedi" },
];

function parseHHMM(t: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isValidRange(start: string, end: string) {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  return s !== null && e !== null && e > s;
}

function defaultWeek(): DayAvailability[] {
  return DAYS.map((d) => ({
    day: d.key,
    available: false,
    start: "08:00",
    end: "21:00",
    note: "",
  }));
}

function readEmployeeCodeFromUrlOrStorage(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get("code") ?? "").replace(/\D/g, "");
  if (urlCode.length >= 4) return urlCode;

  const lsCode = (window.sessionStorage.getItem("kiosk_employee_code") ?? "")
    .replace(/\D/g, "");

  if (lsCode.length >= 4) return lsCode;

  return null;
}

export default function SettingsPage() {
  const { darkMode, toggleTheme } = useTheme();

  // AVAILABILITY STATES
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [week, setWeek] = useState<DayAvailability[]>(() => defaultWeek());
  const [availError, setAvailError] = useState<string | null>(null);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [employeeFullName, setEmployeeFullName] = useState<string>("Profil");
  const [employeeEmail, setEmployeeEmail] = useState<string>("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [emailEditorOpen, setEmailEditorOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerifyStep, setEmailVerifyStep] = useState<"edit" | "verify">("edit");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [kioskMode, setKioskMode] = useState<KioskSecondFactorMode>("EMAIL_OTP");
  const [kioskHasPassword, setKioskHasPassword] = useState(false);
  const [kioskHasEmail, setKioskHasEmail] = useState(false);
  const [kioskNewPw, setKioskNewPw] = useState("");
  const [kioskConfirmPw, setKioskConfirmPw] = useState("");
  const [kioskCurrentPw, setKioskCurrentPw] = useState("");
  const [kioskBusy, setKioskBusy] = useState(false);
  const [kioskMsg, setKioskMsg] = useState<string | null>(null);

  // KIOSK / EMPLOYEE STATES
  const [kioskRole, setKioskRole] = useState<string | null>(null);
  const [employeeLogged, setEmployeeLogged] = useState(false);
  const [employeeCode, setEmployeeCode] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Derived state for sidebar privileges
  const isPrivilegedLogged = kioskRole === "ADMIN" || kioskRole === "MANAGER";

  // Fetch employee info on mount
  useEffect(() => {
    const cachedName = (window.sessionStorage.getItem("kiosk_employee_name") ?? "").trim();
    if (cachedName) setEmployeeFullName(cachedName);

    const code = readEmployeeCodeFromUrlOrStorage();
    if (!code) return;

    setEmployeeCode(code);
    setEmployeeLogged(true);

    (async () => {
      try {
        const res = await fetch(`/api/settings/me?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) return;
        const name = String(data?.employeeName ?? "").trim();
        const email = String(data?.email ?? "").trim();
        const role = String(data?.role ?? "").trim();
        const avatar = typeof data?.profilePhotoDataUrl === "string" ? data.profilePhotoDataUrl.trim() : "";

        if (!name) return;

        setEmployeeFullName(name);
        setEmployeeEmail(email);
        setAvatarDataUrl(avatar || null);
        window.sessionStorage.setItem("kiosk_employee_name", name);
        window.sessionStorage.setItem("kiosk_employee_code", code);
        setKioskRole(role);
      } catch { }
    })();

    (async () => {
      try {
        const res = await fetch(`/api/settings/kiosk-login?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) return;
        const m = String(data?.mode ?? "EMAIL_OTP") as KioskSecondFactorMode;
        setKioskMode(KIOSK_MODE_OPTIONS.some((o) => o.value === m) ? m : "EMAIL_OTP");
        setKioskHasPassword(Boolean(data?.hasPassword));
        setKioskHasEmail(Boolean(data?.hasEmail));
      } catch {
        // ignore
      }
    })();
  }, []);

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }

  async function saveAvatarToServer(nextAvatarDataUrl: string | null) {
    const code = employeeCode ?? readEmployeeCodeFromUrlOrStorage();
    if (!code) return;
    const res = await fetch("/api/settings/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, profilePhotoDataUrl: nextAvatarDataUrl }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(String(data?.error ?? "Erreur sauvegarde photo."));
    }
  }

  function handleAvatarSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setAvatarBusy(true);
      setAvatarMsg(null);
      try {
        await saveAvatarToServer(result);
        setAvatarDataUrl(result);
        setAvatarMsg("Photo mise à jour.");
      } catch {
        setAvatarMsg("Erreur enregistrement photo.");
      } finally {
        setAvatarBusy(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarMsg(null);
    try {
      await saveAvatarToServer(null);
      setAvatarDataUrl(null);
      setAvatarMsg("Photo retirée.");
    } catch {
      setAvatarMsg("Erreur suppression photo.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function sendEmailVerification() {
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await fetch("/api/settings/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, code: readEmployeeCodeFromUrlOrStorage() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEmailMsg(data?.error ?? "Erreur envoi email.");
        return;
      }
      setEmailVerifyStep("verify");
      setEmailMsg(data?.message ?? "Code envoye.");
    } catch {
      setEmailMsg("Erreur reseau.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function saveKioskLoginSettings() {
    const code = readEmployeeCodeFromUrlOrStorage();
    if (!code) {
      setKioskMsg("Code employé introuvable.");
      return;
    }

    setKioskMsg(null);
    const mustSetPw =
      (kioskMode === "PASSWORD" || kioskMode === "EMAIL_AND_PASSWORD") &&
      !kioskHasPassword &&
      (!kioskNewPw.trim() || kioskNewPw !== kioskConfirmPw);

    if (mustSetPw) {
      setKioskMsg(
        !kioskNewPw.trim()
          ? "Choisis un mot de passe valide et confirme-le."
          : "La confirmation ne correspond pas au nouveau mot de passe."
      );
      return;
    }

    if (kioskNewPw && kioskNewPw !== kioskConfirmPw) {
      setKioskMsg("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    if (kioskNewPw.trim()) {
      const pv = validateKioskPasswordPolicy(kioskNewPw);
      if (!pv.ok) {
        setKioskMsg(pv.error);
        return;
      }
    }

    setKioskBusy(true);
    try {
      const res = await fetch("/api/settings/kiosk-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          mode: kioskMode,
          newPassword: kioskNewPw.trim() || undefined,
          currentPassword: kioskCurrentPw.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setKioskMsg(data?.error ?? "Erreur enregistrement.");
        return;
      }
      setKioskMsg("Réglages kiosque enregistrés.");
      setKioskHasPassword(Boolean(data?.hasPassword));
      setKioskHasEmail(Boolean(data?.hasEmail));
      setKioskNewPw("");
      setKioskConfirmPw("");
      setKioskCurrentPw("");
    } catch {
      setKioskMsg("Erreur réseau.");
    } finally {
      setKioskBusy(false);
    }
  }

  async function confirmEmailVerification() {
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await fetch("/api/settings/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: emailOtp, code: readEmployeeCodeFromUrlOrStorage() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEmailMsg(data?.error ?? "Code invalide.");
        return;
      }
      const updated = String(data?.email ?? "").trim();
      setEmployeeEmail(updated);
      setEmailMsg("Email mis a jour.");
      setEmailEditorOpen(false);
      setEmailVerifyStep("edit");
      setEmailOtp("");
      setNewEmail("");
    } catch {
      setEmailMsg("Erreur reseau.");
    } finally {
      setEmailBusy(false);
    }
  }

  // Avatar initial
  const avatarLetter = useMemo(() => {
    const parts = employeeFullName
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "E";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "E";
    const first = parts[0][0] ?? "";
    const last = parts[parts.length - 1][0] ?? "";
    return `${first}${last}`.toUpperCase();
  }, [employeeFullName]);

  // Summary of availability
  const summaryLines = useMemo(() => {
    return week
      .filter((d) => d.available)
      .map((d) => {
        const label = DAYS.find((x) => x.key === d.day)?.labelFR ?? d.day;
        return `${label}: ${d.start}–${d.end}`;
      });
  }, [week]);

  // Update a day
  function updateDay(day: DayKey, patch: Partial<DayAvailability>) {
    setWeek((prev) => prev.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  }

  // Validate week
  function validateWeekPayload(w: DayAvailability[]): string | null {
    if (!w.some((d) => d.available)) return "Choisis au moins une journée disponible.";
    for (const d of w) {
      if (!d.available) continue;
      if (!isValidRange(d.start, d.end)) {
        const label = DAYS.find((x) => x.key === d.day)?.labelFR ?? d.day;
        return `Heures invalides pour ${label} (fin doit être après début).`;
      }
    }
    return null;
  }

  // Save availability
  async function handleSave() {
    const err = validateWeekPayload(week);
    setAvailError(err);
    if (err) return;

    const code = readEmployeeCodeFromUrlOrStorage();
    if (!code) {
      setAvailError("Code employé introuvable.");
      return;
    }

    const normalizedWeek = week.map((d) => ({
      ...d,
      note: d.available ? availabilityNote.trim() : "",
    }));

    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, week: normalizedWeek }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setAvailError(data?.error ?? "Erreur lors de l’enregistrement.");
      return;
    }

    setIsAvailOpen(false);
  }

  // Load availability from API on mount
  useEffect(() => {
    (async () => {
      const code = readEmployeeCodeFromUrlOrStorage();
      if (!code) return;

      const res = await fetch(`/api/availability?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.week) && data.week.length === 7) {
        setWeek(data.week);
        const firstNote = data.week.find((d: DayAvailability) => d.note?.trim())?.note ?? "";
        setAvailabilityNote(firstNote);
      }
    })();
  }, []);

  return (
    <div className="settingsScope">
      <Suspense fallback={<div>Loading menu…</div>}>
        <KioskSidebar
          isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={employeeCode}
        />
      </Suspense>

      <main className="settingsPage">
        <div className="settingsShell">
          <header className="settings-header">
            <h1 className="settings-title">Paramètres</h1>
            <p className="settings-subtitle">
              Personnalise l’apparence de l’application.
            </p>
          </header>

          <section className="settings-content">
            <div className="settings-card profile-card">
              <div className="profile-row">
                <div className="avatar-wrap">
                  <button
                    type="button"
                    className="avatar-fallback avatar-button"
                    onClick={openAvatarPicker}
                    title="Changer la photo"
                    disabled={avatarBusy}
                  >
                    {avatarDataUrl ? (
                      <Image
                        src={avatarDataUrl}
                        alt="Photo de profil"
                        className="avatar-image"
                        width={56}
                        height={56}
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden="true">{avatarLetter}</span>
                    )}
                    <span className="avatar-overlay" aria-hidden="true">
                      📷
                    </span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    className="avatar-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelected}
                  />
                </div>
                <div className="profile-meta">
                  <div className="profile-name">{employeeFullName}</div>
                  <div className="profile-role">Profil</div>
                  {employeeEmail ? <div className="profile-role">{employeeEmail}</div> : null}
                </div>
              </div>

              <div className="profile-email-actions">
                <button
                  className="theme-toggle-btn"
                  type="button"
                  onClick={() => {
                    setEmailEditorOpen((v) => !v);
                    setEmailMsg(null);
                    setEmailVerifyStep("edit");
                    setEmailOtp("");
                    setNewEmail(employeeEmail);
                  }}
                >
                  {emailEditorOpen ? "Fermer email" : "Changer email"}
                </button>
                {avatarDataUrl ? (
                  <button className="settings-modal-btn ghost profile-remove-avatar" type="button" onClick={removeAvatar} disabled={avatarBusy}>
                    Retirer photo
                  </button>
                ) : null}
              </div>
              {avatarMsg ? <div className="email-change-msg">{avatarMsg}</div> : null}

              {emailEditorOpen && (
                <div className="email-change-box">
                  {emailVerifyStep === "edit" ? (
                    <>
                      <label className="email-change-label">Nouvel email</label>
                      <input
                        className="email-change-input"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="nouvel@email.com"
                      />
                      <button
                        className="theme-toggle-btn"
                        type="button"
                        disabled={emailBusy || !newEmail.trim()}
                        onClick={sendEmailVerification}
                      >
                        {emailBusy ? "..." : "Envoyer code verification"}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="email-change-label">Code de verification</label>
                      <input
                        className="email-change-input"
                        inputMode="numeric"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                      />
                      <div className="email-change-actions">
                        <button
                          className="theme-toggle-btn"
                          type="button"
                          disabled={emailBusy || emailOtp.length !== 6}
                          onClick={confirmEmailVerification}
                        >
                          {emailBusy ? "..." : "Verifier et changer"}
                        </button>
                        <button
                          className="settings-modal-btn ghost"
                          type="button"
                          disabled={emailBusy}
                          onClick={() => {
                            setEmailVerifyStep("edit");
                            setEmailOtp("");
                            setEmailMsg(null);
                          }}
                        >
                          Retour
                        </button>
                      </div>
                    </>
                  )}
                  {emailMsg ? <div className="email-change-msg">{emailMsg}</div> : null}
                </div>
              )}

              <div className="profile-summary">
                <div className="profile-summary-title">
                  Disponibilités (semaine)
                </div>
                {summaryLines.length === 0 ? (
                  <div className="profile-summary-empty">
                    Aucune disponibilité enregistrée pour l’instant.
                  </div>
                ) : (
                  <ul className="profile-summary-list">
                    {summaryLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                className="theme-toggle-btn"
                type="button"
                onClick={() => {
                  setAvailError(null);
                  setIsAvailOpen(true);
                }}
              >
                Ajouter mes disponibilités
              </button>
            </div>

            <div className="settings-card kiosk-card">
              <h2 className="settings-card-title">Connexion kiosque (après le PIN)</h2>
              <p className="settings-subtitle" style={{ marginBottom: 12 }}>
                Après le code à 4 chiffres, une étape supplémentaire est toujours requise : code email,
                mot de passe, ou les deux selon le mode choisi.
              </p>

              <label className="email-change-label">Mode de vérification</label>
              <select
                className="email-change-input"
                value={kioskMode}
                onChange={(e) => setKioskMode(e.target.value as KioskSecondFactorMode)}
              >
                {KIOSK_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="profile-role" style={{ marginTop: 8 }}>
                {KIOSK_MODE_OPTIONS.find((o) => o.value === kioskMode)?.hint ?? ""}
              </p>

              {!kioskHasEmail && (kioskMode === "EMAIL_OTP" || kioskMode === "EMAIL_AND_PASSWORD") ? (
                <div className="email-change-msg" style={{ marginTop: 10 }}>
                  Ajoute un email ci-dessus pour utiliser ce mode.
                </div>
              ) : null}

              {(kioskMode === "PASSWORD" || kioskMode === "EMAIL_AND_PASSWORD") && (
                <div style={{ marginTop: 16 }}>
                  <label className="email-change-label">
                    {kioskHasPassword ? "Mot de passe actuel (pour modifier)" : ""}
                  </label>
                  {kioskHasPassword ? (
                    <PasswordRevealField
                      inputClassName="email-change-input"
                      autoComplete="current-password"
                      value={kioskCurrentPw}
                      onChange={(e) => setKioskCurrentPw(e.target.value)}
                      placeholder="Mot de passe actuel"
                    />
                  ) : null}

                  <div className="labelRow" style={{ marginTop: 10 }}>
                    <label className="email-change-label" style={{ margin: 0 }}>
                      {kioskHasPassword ? "Nouveau mot de passe" : "Mot de passe kiosque"}
                    </label>
                    <KioskPasswordRequirementsHint id="settings-kiosk-pw-req" />
                  </div>
                  <PasswordRevealField
                    inputClassName="email-change-input"
                    autoComplete="new-password"
                    value={kioskNewPw}
                    onChange={(e) => setKioskNewPw(e.target.value)}
                    placeholder="8+ caractères, 1 chiffre, 1 caractère spécial"
                  />

                  <label className="email-change-label" style={{ marginTop: 10 }}>
                    Confirmer
                  </label>
                  <PasswordRevealField
                    inputClassName="email-change-input"
                    autoComplete="new-password"
                    value={kioskConfirmPw}
                    onChange={(e) => setKioskConfirmPw(e.target.value)}
                    placeholder="Confirmer le mot de passe"
                  />
                </div>
              )}

              {kioskMsg ? <div className="email-change-msg" style={{ marginTop: 12 }}>{kioskMsg}</div> : null}

              <button
                className="theme-toggle-btn"
                type="button"
                style={{ marginTop: 14 }}
                disabled={kioskBusy}
                onClick={saveKioskLoginSettings}
              >
                {kioskBusy ? "..." : "Enregistrer la connexion kiosque"}
              </button>
            </div>

            <div className="settings-card appearance-card">
              <h2 className="settings-card-title">Apparence</h2>
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                type="button"
                aria-pressed={darkMode}
              >
                {darkMode ? "Mode clair 🌞" : "Mode sombre 🌙"}
              </button>
            </div>
          </section>
        </div>
      </main>

      {isAvailOpen && (
        <div
          className="settings-modal-overlay"
          role="dialog"
          aria-modal="true"
        >
          <div className="settings-modal-card">
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-title">Mes disponibilités</div>
                <div className="settings-modal-subtitle">
                  Indique quand tu peux travailler (Dimanche → Samedi).
                </div>
              </div>
              <button
                className="settings-modal-x"
                type="button"
                onClick={() => setIsAvailOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="settings-modal-body">
              {availError && (
                <div className="settings-modal-error">{availError}</div>
              )}

              <div className="avail-grid">
                {DAYS.map((d) => {
                  const item = week.find((x) => x.day === d.key)!;
                  return (
                    <div className="avail-row" key={d.key}>
                      <div className="avail-day">
                        <div className="avail-day-name">{d.labelFR}</div>
                        <label className="avail-toggle">
                          <input
                            type="checkbox"
                            checked={item.available}
                            onChange={(e) =>
                              updateDay(d.key, { available: e.target.checked })
                            }
                          />
                          <span>{item.available ? "Disponible" : "Indispo"}</span>
                        </label>
                      </div>

                      <div className="avail-times">
                        <input
                          className="avail-time"
                          type="time"
                          step={60}
                          autoComplete="off"
                          aria-label={`Heure de début — ${d.labelFR}`}
                          value={item.start}
                          disabled={!item.available}
                          onChange={(e) => updateDay(d.key, { start: e.target.value })}
                        />
                        <span className="avail-sep">→</span>
                        <input
                          className="avail-time"
                          type="time"
                          step={60}
                          autoComplete="off"
                          aria-label={`Heure de fin — ${d.labelFR}`}
                          value={item.end}
                          disabled={!item.available}
                          onChange={(e) => updateDay(d.key, { end: e.target.value })}
                        />
                      </div>

                    </div>
                  );
                })}
              </div>

              <div className="avail-note-block">
                <label className="avail-note-label">Note pour les disponibilités (visible au boss)</label>
                <input
                  className="avail-note-global"
                  type="text"
                  placeholder="Ex: Disponible de façon flexible cette semaine"
                  value={availabilityNote}
                  onChange={(e) => setAvailabilityNote(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="settings-modal-actions">
              <button
                className="settings-modal-btn ghost"
                type="button"
                onClick={() => {
                  setAvailError(null);
                  setWeek(defaultWeek());
                  setAvailabilityNote("");
                }}
              >
                Réinitialiser
              </button>
              <button
                className="settings-modal-btn"
                type="button"
                onClick={handleSave}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}