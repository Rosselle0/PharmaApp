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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Close drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [path]);

  // Close drawer when resizing to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const handler = () => {
      if (mq.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    if (mobileMenuOpen && typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileMenuOpen]);

  // Close drawer on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const qs = effectiveEmployeeCode
    ? `?code=${encodeURIComponent(effectiveEmployeeCode)}`
    : "";

  const isActive = (href: string) => path.startsWith(href);
  const isKioskHome = path === "/kiosk";
  const isSidebarUnlocked = isPrivilegedLogged || employeeLogged;

  const preventWhenLocked = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isSidebarUnlocked) e.preventDefault();
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      {/* Mobile: fixed header bar with hamburger */}
      <header className="kiosk-mobile-header">
        <button
          type="button"
          className="kiosk-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <span className="kiosk-mobile-menu-icon" aria-hidden>☰</span>
        </button>
        <span className="kiosk-mobile-header-title">Accès Pharma</span>
      </header>

      {/* Backdrop when drawer is open */}
      {mobileMenuOpen && (
        <div
          className="kiosk-sidebar-backdrop"
          onClick={closeMobileMenu}
          role="button"
          tabIndex={0}
          aria-label="Fermer le menu"
        />
      )}

      <aside className={`kiosk-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <button
          type="button"
          className="kiosk-sidebar-close"
          onClick={closeMobileMenu}
          aria-label="Fermer le menu"
        >
          ✕
        </button>
        <div className="kiosk-navTop">
        {!isKioskHome && (
          <Link
            href={`/kiosk${qs}`}
            className={`kiosk-btn ${isActive("/kiosk") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
            aria-disabled={!isSidebarUnlocked}
            title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
            onClick={(e) => {
              preventWhenLocked(e);
              closeMobileMenu();
            }}
          >
            <span>🏠</span> Retour au Kiosk
          </Link>
        )}

        <Link
          href={`/schedule${qs}`}
          className={`kiosk-btn ${isActive("/schedule") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={(e) => {
            preventWhenLocked(e);
            closeMobileMenu();
          }}
        >
          <span>📅</span> Horaire
        </Link>

        <Link
          href={`/changement${qs}`}
          className={`kiosk-btn ${isActive("/changement") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={(e) => {
            preventWhenLocked(e);
            closeMobileMenu();
          }}
        >
          <span>🔁</span> Changement
        </Link>

        <Link
          href={`/task-list${qs}`}
          className={`kiosk-btn ${isActive("/task-list") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={(e) => {
            preventWhenLocked(e);
            closeMobileMenu();
          }}
        >
          <span>📋</span> Liste des tâches
        </Link>

        <Link
          href={`/vacation${qs}`}
          className={`kiosk-btn ${isActive("/vacation") ? "active" : ""} ${!isSidebarUnlocked ? "disabled" : ""}`}
          aria-disabled={!isSidebarUnlocked}
          title={!isSidebarUnlocked ? "Connecte-toi d’abord" : undefined}
          onClick={(e) => {
            preventWhenLocked(e);
            closeMobileMenu();
          }}
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
          onClick={(e) => {
            preventWhenLocked(e);
            closeMobileMenu();
          }}
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
            closeMobileMenu();
          }}
        >
          <span>🔒</span> Logs
          {!isPrivilegedLogged && <span className="lockBadge">🔒</span>}
        </Link>
      </div>
    </aside>
    </>
  );
}