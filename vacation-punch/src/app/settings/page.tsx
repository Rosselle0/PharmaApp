"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import "./settings.css";
import KioskSidebar from "@/components/KioskSidebar";

type ThemeMode = "light" | "dark";

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
    start: "09:00",
    end: "17:00",
    note: "",
  }));
}

function readEmployeeCodeFromUrlOrStorage(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get("code") ?? "").replace(/\D/g, "");
  if (urlCode.length >= 4) return urlCode;

  const lsCode = (window.localStorage.getItem("kiosk_employee_code") ?? "")
    .replace(/\D/g, "");

  if (lsCode.length >= 4) return lsCode;

  return null;
}

export default function SettingsPage() {
  // THEME & AVAILABILITY STATES
  const [darkMode, setDarkMode] = useState(false);
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [week, setWeek] = useState<DayAvailability[]>(() => defaultWeek());
  const [availError, setAvailError] = useState<string | null>(null);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [employeeFullName, setEmployeeFullName] = useState<string>("Profil");
  const [employeeEmail, setEmployeeEmail] = useState<string>("");

  // KIOSK / EMPLOYEE STATES
  const [kioskRole, setKioskRole] = useState<string | null>(null);
  const [employeeLogged, setEmployeeLogged] = useState(false);
const [employeeCode, setEmployeeCode] = useState<string | null>(null);

  // Derived state for sidebar privileges
  const isPrivilegedLogged = kioskRole === "ADMIN" || kioskRole === "MANAGER";

  // Fetch employee info on mount
  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme") as ThemeMode | null) ?? "light";
    const isDark = savedTheme === "dark";
    setDarkMode(isDark);
    document.documentElement.setAttribute("data-theme", savedTheme);

    const cachedName = (localStorage.getItem("kiosk_employee_name") ?? "").trim();
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

        if (!name) return;

        setEmployeeFullName(name);
        setEmployeeEmail(email);
        localStorage.setItem("kiosk_employee_name", name);
        localStorage.setItem("kiosk_employee_code", code);
        setKioskRole(role);
      } catch { }
    })();
  }, []);

  // Theme toggle
  const toggleTheme = () => {
    const newMode: ThemeMode = darkMode ? "light" : "dark";
    setDarkMode(!darkMode);
    document.documentElement.setAttribute("data-theme", newMode);
    localStorage.setItem("theme", newMode);
  };

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
  function validateWeek(): string | null {
    if (!week.some((d) => d.available)) return "Choisis au moins une journée disponible.";
    for (const d of week) {
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
    const err = validateWeek();
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
                <div className="avatar-fallback" aria-hidden="true">
                  {avatarLetter}
                </div>
                <div className="profile-meta">
                  <div className="profile-name">{employeeFullName}</div>
                  <div className="profile-role">Profil</div>
                  {employeeEmail ? <div className="profile-role">{employeeEmail}</div> : null}
                </div>
              </div>

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

            <div className="settings-card">
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
                          value={item.start}
                          disabled={!item.available}
                          onChange={(e) =>
                            updateDay(d.key, { start: e.target.value })
                          }
                        />
                        <span className="avail-sep">→</span>
                        <input
                          className="avail-time"
                          type="time"
                          value={item.end}
                          disabled={!item.available}
                          onChange={(e) =>
                            updateDay(d.key, { end: e.target.value })
                          }
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