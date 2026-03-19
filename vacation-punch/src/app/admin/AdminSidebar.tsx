"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PrivRole } from "@/lib/privilgedAuth";
import "./admin-sidebar.css";

type NavItem = {
  href: string;
  label: string;
  roles: PrivRole[];
  icon: "dashboard" | "employees" | "tasks" | "schedule" | "requests" | "logs";
};

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  // Keep active on nested pages for the same section.
  if (href === "/admin/dashboard") return pathname.startsWith("/admin/dashboard");
  if (href === "/admin/modify") return pathname.startsWith("/admin/modify");
  if (href === "/admin/create-account") return pathname.startsWith("/admin/create-account");
  if (href === "/admin/creation-t") return pathname.startsWith("/admin/creation-t");
  if (href === "/admin/requests") return pathname.startsWith("/admin/requests");
  if (href === "/admin/logs") return pathname.startsWith("/admin/logs");
  if (href === "/schedule/edit") return pathname.startsWith("/schedule/edit");
  return pathname.startsWith(href);
}

function Icon({ name }: { name: NavItem["icon"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 13.5V20h6v-6.5H4Z" stroke="currentColor" strokeWidth="2" />
          <path d="M14 4v7h6V4h-6Z" stroke="currentColor" strokeWidth="2" />
          <path d="M14 13.5V20h6v-6.5h-6Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 4v7h6V4H4Z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "employees":
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M16 11c1.657 0 3-1.567 3-3.5S17.657 4 16 4s-3 1.567-3 3.5S14.343 11 16 11Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M8 11c1.657 0 3-1.567 3-3.5S9.657 4 8 4 5 5.567 5 7.5 6.343 11 8 11Z" stroke="currentColor" strokeWidth="2" />
          <path d="M2.5 20c0-3.2 2.6-5.5 5.5-5.5S13.5 16.8 13.5 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M13.5 20c0-2.6 2-4.5 4.5-4.5 2.1 0 3.8 1.2 4.5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 11l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M7 3v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 3v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "requests":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 4h16v12H5.2L4 17.2V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 12h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case "logs":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 5h16v14H4V5Z" stroke="currentColor" strokeWidth="2" />
          <path d="M8 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
          <path d="M7 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AdminSidebar({ role }: { role: PrivRole }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = useMemo<NavItem[]>(
    () => [
      { href: "/admin/dashboard", label: "Tableau de bord", roles: ["ADMIN", "MANAGER"], icon: "dashboard" },
      { href: "/admin/modify", label: "Modifier comptes", roles: ["ADMIN", "MANAGER"], icon: "employees" },
      { href: "/admin/create-account", label: "Créer compte", roles: ["ADMIN", "MANAGER"], icon: "employees" },
      { href: "/admin/creation-t", label: "Création tâches", roles: ["ADMIN", "MANAGER"], icon: "tasks" },
      { href: "/schedule/edit", label: "Création horaire", roles: ["ADMIN", "MANAGER"], icon: "schedule" },
      { href: "/admin/requests", label: "Demandes", roles: ["ADMIN", "MANAGER"], icon: "requests" },
      { href: "/admin/logs", label: "Journaux", roles: ["ADMIN", "MANAGER"], icon: "logs" },
    ],
    []
  );

  const allowed = useMemo(() => items.filter((i) => i.roles.includes(role)), [items, role]);

  const content = (
    <>
      <div className="adminSidebarTop">
        <div className="adminSidebarBrand">
          <div className="adminSidebarLogo" aria-hidden="true">
            P
          </div>
          <div className="adminSidebarBrandText">
            <div className="adminSidebarBrandName">PharmaApp</div>
            <div className="adminSidebarBrandSub">Admin</div>
          </div>
        </div>
      </div>

      <div className="adminSidebarNav" role="navigation" aria-label="Admin">
        <div className="adminSidebarGroupTitle">Navigation</div>
        {allowed.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`adminSidebarLink ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <span className="adminSidebarLinkIcon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <span className="adminSidebarLinkLabel">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="adminSidebarBottom">
        <Link href="/kiosk" className="adminSidebarReturn" onClick={() => setMobileOpen(false)}>
          ← Retour Kiosk
        </Link>
      </div>
    </>
  );

  return (
    <>
      <aside className="adminSidebarDesktop" aria-label="Admin sidebar">
        {content}
      </aside>

      <button className="adminSidebarMobileToggle" type="button" onClick={() => setMobileOpen(true)} aria-label="Open admin menu">
        Menu
      </button>

      {mobileOpen ? (
        <div className="adminSidebarMobileOverlay" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button className="adminSidebarMobileClose" type="button" onClick={() => setMobileOpen(false)} aria-label="Close">
            ✕
          </button>
          <div className="adminSidebarMobilePanel">{content}</div>
          <button className="adminSidebarMobileBackdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Close overlay" />
        </div>
      ) : null}
    </>
  );
}

