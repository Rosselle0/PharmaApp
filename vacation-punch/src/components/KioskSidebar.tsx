"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

type KioskSidebarProps = {
  isPrivilegedLogged: boolean;
  employeeLogged: boolean;
  employeeCode?: string | null;
};

function readStoredEmployeeCode(): string | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem("kiosk_employee_code") ?? "";
  const clean = raw.replace(/\D/g, "");
  return clean.length >= 4 ? clean : null;
}

export default function KioskSidebar({
  isPrivilegedLogged,
  employeeLogged,
  employeeCode,
}: KioskSidebarProps) {
  const path = usePathname();
  const searchParams = useSearchParams();

  const effectiveEmployeeCode = useMemo(() => {
    const propCode = (employeeCode ?? "").replace(/\D/g, "");
    if (propCode.length >= 4) return propCode;

    const urlCode = (searchParams.get("code") ?? "").replace(/\D/g, "");
    if (urlCode.length >= 4) return urlCode;

    return readStoredEmployeeCode();
  }, [employeeCode, searchParams]);

  const qs = effectiveEmployeeCode
    ? `?code=${encodeURIComponent(effectiveEmployeeCode)}`
    : "";

  const isActive = (href: string) => path.startsWith(href);
  const isKioskHome = path === "/kiosk";

  return (
    <aside className="kiosk-sidebar">
      <div className="kiosk-navTop">
        {!isKioskHome && (
          <Link
            href={`/kiosk${qs}`}
            className={`kiosk-btn ${isActive("/kiosk") ? "active" : ""}`}
          >
            <span>🏠</span> Retour au Kiosk
          </Link>
        )}

        <Link
          href={`/schedule${qs}`}
          className={`kiosk-btn ${isActive("/schedule") ? "active" : ""}`}
        >
          <span>📅</span> Horaire
        </Link>

        <Link
          href={`/changement${qs}`}
          className={`kiosk-btn ${isActive("/changement") ? "active" : ""}`}
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
          href="/admin/dashboard"
          className={`kiosk-btn ${isActive("/admin/dashboard") ? "active" : ""} ${
            !isPrivilegedLogged ? "disabled" : ""
          }`}
          title={!isPrivilegedLogged ? "Connexion admin ou manager requise" : undefined}
          onClick={(e) => {
            if (!isPrivilegedLogged) e.preventDefault();
          }}
        >
          <span>🔒</span> Logs
          {!isPrivilegedLogged && <span className="lockBadge">🔒</span>}
        </Link>
      </div>
    </aside>
  );
}