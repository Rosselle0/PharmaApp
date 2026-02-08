"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./settings.css";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDarkMode(true);
    document.documentElement.setAttribute("data-theme", saved || "light");
  }, []);

  const toggleTheme = () => {
    const newMode = darkMode ? "light" : "dark";
    setDarkMode(!darkMode);
    document.documentElement.setAttribute("data-theme", newMode);
    localStorage.setItem("theme", newMode);
  };

  return (
    <main className="settings-page">
      {/* HEADER */}
      <header className="settings-header">
        <h1>Paramètres</h1>
      </header>

      {/* MAIN SETTINGS AREA */}
      <section className="settings-content">
        <div className="settings-card">
          <h2>Apparence</h2>
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {darkMode ? "Mode clair 🌞" : "Mode sombre 🌙"}
          </button>
        </div>
      </section>

      {/* FOOTER / NAV */}
      <footer className="settings-footer">
        <Link href="/kiosk" className="back-link">
          {/* Optional: SVG arrow for sharp look */}
          <span>←</span> Retour au Dashboard
        </Link>
      </footer>
    </main>
  );
}
