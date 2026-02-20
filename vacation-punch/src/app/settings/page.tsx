"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./settings.css";

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
  // returns minutes from 00:00 or null if invalid
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isValidRange(start: string, end: string): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return false;
  return e > s; // same time or earlier = invalid
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

const PIN_LEN = 8;

function readEmployeeCodeFromUrlOrStorage(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
  if (urlCode.length === PIN_LEN) return urlCode;

  const lsCode = (localStorage.getItem("kiosk_employee_code") ?? "")
    .replace(/\D/g, "")
    .slice(0, PIN_LEN);
  if (lsCode.length === PIN_LEN) return lsCode;

  return null;
}

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);

  // ===== Availability modal =====
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [week, setWeek] = useState<DayAvailability[]>(() => defaultWeek());
  const [availError, setAvailError] = useState<string | null>(null);

  // =========================
  // Theme: load saved preference on mount
  // =========================
  const [employeeFullName, setEmployeeFullName] = useState<string>("Profil");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as ThemeMode | null) ?? "light";
    const isDark = saved === "dark";
    setDarkMode(isDark);
    document.documentElement.setAttribute("data-theme", saved);

    // ✅ exact same cache key as Tasks page
    const cachedName = (localStorage.getItem("kiosk_employee_name") ?? "").trim();
    if (cachedName) setEmployeeFullName(cachedName);

    const code = readEmployeeCodeFromUrlOrStorage();
    if (!code) return;

    // If we already had a cached name, you can skip fetch.
    // But fetching keeps it always correct if names change.
    (async () => {
      try {
        const res = await fetch(`/api/settings/me?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });

        const text = await res.text();
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) return; // keep cached fallback
        const name = String(data?.employeeName ?? "").trim();
        if (!name) return;

        setEmployeeFullName(name);
        localStorage.setItem("kiosk_employee_name", name);
        localStorage.setItem("kiosk_employee_code", code); // keep consistent
      } catch {
        // ignore: keep fallback
      }
    })();
  }, []);


  // =========================
  // Theme: toggle + persist
  // =========================
  const toggleTheme = () => {
    const newMode: ThemeMode = darkMode ? "light" : "dark";
    setDarkMode(!darkMode);
    document.documentElement.setAttribute("data-theme", newMode);
    localStorage.setItem("theme", newMode);
  };

  // Avatar letter (fallback icon)
  const avatarLetter = useMemo(() => {
    const clean = employeeFullName.trim();
    return clean.length ? clean[0].toUpperCase() : "E";
  }, [employeeFullName]);

  // Build a simple summary for the boss “paper” feel
  const summaryLines = useMemo(() => {
    return week
      .filter((d) => d.available)
      .map((d) => {
        const label = DAYS.find((x) => x.key === d.day)?.labelFR ?? d.day;
        const note = d.note.trim() ? ` — ${d.note.trim()}` : "";
        return `${label}: ${d.start}–${d.end}${note}`;
      });
  }, [week]);

  function updateDay(day: DayKey, patch: Partial<DayAvailability>) {
    setWeek((prev) =>
      prev.map((d) => (d.day === day ? { ...d, ...patch } : d))
    );
  }

  function validateWeek(): string | null {
    // at least one day selected
    const any = week.some((d) => d.available);
    if (!any) return "Choisis au moins une journée disponible.";

    // validate ranges for available days
    for (const d of week) {
      if (!d.available) continue;
      if (!isValidRange(d.start, d.end)) {
        const label = DAYS.find((x) => x.key === d.day)?.labelFR ?? d.day;
        return `Heures invalides pour ${label} (fin doit être après début).`;
      }
    }
    return null;
  }

  async function handleSave() {
    const err = validateWeek();
    setAvailError(err);
    if (err) return;

    const code = readEmployeeCodeFromUrlOrStorage();
    if (!code) {
      setAvailError("Code employé introuvable.");
      return;
    }

    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, week }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setAvailError(data?.error ?? "Erreur lors de l’enregistrement.");
      return;
    }

    setIsAvailOpen(false);
  }

  useEffect(() => {
    (async () => {
      const code = readEmployeeCodeFromUrlOrStorage();
      if (!code) return;

      const res = await fetch(`/api/availability?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.week) && data.week.length === 7) {
        setWeek(data.week);
      }
    })();
  }, []);


  return (
    <main className="settings-page">
      {/* =========================
          HEADER
         ========================= */}
      <header className="settings-header">
        <h1 className="settings-title">Paramètres</h1>
        <p className="settings-subtitle">Personnalise l’apparence de l’application.</p>
      </header>

      {/* =========================
          PROFILE (EMPLOYEE)
         ========================= */}
      <section className="settings-content">
        <div className="settings-card profile-card">
          <div className="profile-row">
            <div className="avatar-fallback" aria-hidden="true">
              {avatarLetter}
            </div>

            <div className="profile-meta">
              <div className="profile-name">{employeeFullName}</div>
              <div className="profile-role">Profil</div>
            </div>
          </div>

          {/* Availability quick summary (optional but makes it feel real) */}
          <div className="profile-summary">
            <div className="profile-summary-title">Disponibilités (semaine)</div>
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

        {/* =========================
            APPEARANCE
           ========================= */}
        <div className="settings-card">
          <h2>Apparence</h2>
          <button className="theme-toggle-btn" onClick={toggleTheme} type="button" aria-pressed={darkMode}>
            {darkMode ? "Mode clair 🌞" : "Mode sombre 🌙"}
          </button>
        </div>
      </section>

      {/* =========================
          FOOTER / NAV
         ========================= */}
      <footer className="settings-footer">
        <Link href="/kiosk" className="back-link">
          <span aria-hidden="true">←</span> Retour au Dashboard
        </Link>
      </footer>

      {/* =========================
          AVAILABILITY MODAL 
         ========================= */}
      {isAvailOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <div className="modal-title">Mes disponibilités</div>
                <div className="modal-subtitle">
                  Indique quand tu peux travailler (Dimanche → Samedi).
                </div>
              </div>

              <button
                className="modal-x"
                type="button"
                onClick={() => setIsAvailOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {availError && <div className="modal-error">{availError}</div>}

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
                          onChange={(e) => updateDay(d.key, { start: e.target.value })}
                        />
                        <span className="avail-sep">→</span>
                        <input
                          className="avail-time"
                          type="time"
                          value={item.end}
                          disabled={!item.available}
                          onChange={(e) => updateDay(d.key, { end: e.target.value })}
                        />
                      </div>

                      <input
                        className="avail-note"
                        type="text"
                        placeholder="Note (optionnel)"
                        value={item.note}
                        disabled={!item.available}
                        onChange={(e) => updateDay(d.key, { note: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="modal-btn ghost"
                type="button"
                onClick={() => {
                  setAvailError(null);
                  setWeek(defaultWeek());
                }}
              >
                Réinitialiser
              </button>

              <button className="modal-btn" type="button" onClick={handleSave}>
                Enregistrer (local)
              </button>
            </div>

            <div className="modal-footnote">
              *Pour l’instant, c’est juste sauvegardé localement (pas encore envoyé au manager).
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
