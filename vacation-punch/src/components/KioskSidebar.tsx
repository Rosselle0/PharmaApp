"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function KioskSidebar() {
  const path = usePathname(); // current route
  const searchParams = useSearchParams();
  const code = searchParams?.get("code");

  // Helper to append code query
  const qs = code ? `?code=${encodeURIComponent(code)}` : "";

  // Determine active links
  const isActive = (href: string) => path.startsWith(href);

  return (
    <aside className="kiosk-sidebar">
      <div className="kiosk-navTop">
        {/* New Kiosk Home button */}
        <Link
          href={`/kiosk${qs}`}
          className={`kiosk-btn ${isActive("/kiosk") ? "active" : ""}`}
        >
          <span>🏠</span> Retour au Kiosk
        </Link>

        {/* Existing buttons */}
        <Link
          href={`/schedule${qs}`}
          className={`kiosk-btn ${isActive("/schedule") ? "active" : ""}`}
        >
          <span>📅</span> Horaire
        </Link>

        <Link
          href={`/change${qs}`}
          className={`kiosk-btn ${isActive("/change") ? "active" : ""}`}
        >
          <span>🔁</span> Changement
        </Link>

        <Link
          href={`/task-list${qs}`}
          className={`kiosk-btn ${isActive("/task-list") ? "active" : ""}`}
        >
          <span>📋</span> Liste des tâches
        </Link>

        <Link
          href={`/vacation${qs}`}
          className={`kiosk-btn ${isActive("/vacation") ? "active" : ""}`}
        >
          <span>🌴</span> Vacance / Congé
        </Link>
      </div>

      <div className="kiosk-navBottom">
        <Link
          href={`/settings${qs}`}
          className={`kiosk-btn ${isActive("/settings") ? "active" : ""}`}
        >
          <span>⚙️</span> Paramètres
        </Link>

        <Link
          href={`/logs${qs}`}
          className={`kiosk-btn ${isActive("/logs") ? "active" : ""}`}
        >
          <span>🔒</span> Logs
        </Link>
      </div>
    </aside>
  );
}