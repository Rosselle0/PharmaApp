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
  const isSidebarUnlocked = isPrivilegedLogged || employeeLogged;

  const preventWhenLocked = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isSidebarUnlocked) e.preventDefault();
  };

  return (
    <aside className="kiosk-sidebar">
      <div className="kiosk-navTop">
        {!isKioskHome && (
          <Link
            href={`/kiosk${qs}`}
            className={`kiosk-btn ${isActive("/kiosk") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
            aria-disabled={!isSidebarUnlocked}
            title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
            onClick={preventWhenLocked}
          >
            <span>🏠</span> Retour au Kiosk
          </Link>
        )}

        <Link
          href={`/schedule${qs}`}
          className={`kiosk-btn ${isActive("/schedule") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={preventWhenLocked}
        >
          <span>📅</span> Horaire
        </Link>

        <Link
          href={`/changement${qs}`}
          className={`kiosk-btn ${isActive("/changement") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={preventWhenLocked}
        >
          <span>🔁</span> Changement
        </Link>

        <Link
          href={`/task-list${qs}`}
          className={`kiosk-btn ${isActive("/task-list") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={preventWhenLocked}
        >
          <span>📋</span> Liste des tâches
        </Link>

        <Link
          href={`/vacation${qs}`}
          className={`kiosk-btn ${isActive("/vacation") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={preventWhenLocked}
        >
          <span>🌴</span> Vacance / Congé
        </Link>
      </div>

      <div className="kiosk-navBottom">
        <Link
          href={`/settings${qs}`}
          className={`kiosk-btn ${isActive("/settings") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={preventWhenLocked}
        >
          <span>⚙️</span> Paramètres
        </Link>

        <Link
          href="/admin/dashboard"
          className={`kiosk-btn ${isActive("/admin/dashboard") ? "active" : ""} ${
            !isSidebarUnlocked || !isPrivilegedLogged ? "disabled" : ""
          }`}
          aria-disabled={!isSidebarUnlocked || !isPrivilegedLogged}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : !isPrivilegedLogged ? "Connexion admin ou manager requise" : undefined}
          onClick={(e) => {
            if (!isSidebarUnlocked || !isPrivilegedLogged) e.preventDefault();
          }}
        >
          <span>🔒</span> Logs
          {!isPrivilegedLogged && <span className="lockBadge">🔒</span>}
        </Link>
      </div>
    </aside>
  );
}