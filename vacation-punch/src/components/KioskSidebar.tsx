"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "./kioskSidebar.css";

type KioskSidebarProps = {
  isPrivilegedLogged: boolean;
  employeeLogged: boolean;
  employeeCode?: string | null;
};

function normalizeEmployeeCode(value: string | null | undefined): string | null {
  const clean = String(value ?? "").replace(/\D/g, "");
  return clean.length >= 4 ? clean : null;
}

function readStoredEmployeeCode(): string | null {
  if (typeof window === "undefined") return null;
  return normalizeEmployeeCode(
    window.localStorage.getItem("kiosk_employee_code") ?? ""
  );
}

function readEmployeeCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return normalizeEmployeeCode(params.get("code"));
}

export default function KioskSidebar({
  isPrivilegedLogged,
  employeeLogged,
  employeeCode,
}: KioskSidebarProps) {
  const path = usePathname();
  const [effectiveEmployeeCode, setEffectiveEmployeeCode] = useState<string | null>(
    normalizeEmployeeCode(employeeCode)
  );

  useEffect(() => {
    const nextCode =
      normalizeEmployeeCode(employeeCode) ??
      readEmployeeCodeFromUrl() ??
      readStoredEmployeeCode();

    setEffectiveEmployeeCode(nextCode);
  }, [employeeCode]);

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