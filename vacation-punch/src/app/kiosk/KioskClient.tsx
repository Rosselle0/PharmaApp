"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import "./kiosk.css";

type NavItem = {
  label: string;
  href: string;
  requiresEmployeeCode?: boolean;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Horaire", href: "/schedule", requiresEmployeeCode: true },
  { label: "Changement", href: "/change", requiresEmployeeCode: true },
  { label: "Task list", href: "/tasks", requiresEmployeeCode: true },
  { label: "Conge", href: "/vacation", requiresEmployeeCode: true },

  { label: "Modifier c", href: "/admin/modify", adminOnly: true },
  { label: "Creation c", href: "/admin/create-account", adminOnly: true },
  { label: "Creation h", href: "/admin/create-schedule", adminOnly: true },
];

type ActiveRow = { name: string; status: "GREEN" | "RED" | "GRAY"; time: string };

export default function KioskClient({ isAdminLogged }: { isAdminLogged: boolean }) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  // employee code
  const [employeeCode, setEmployeeCode] = useState("");
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // admin modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState(process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Actifs empty at start
  const actifs: ActiveRow[] = [];

  const canAccessEmployeePages = useMemo(
    () => employeeCode.trim().length > 0,
    [employeeCode]
  );

  function onNavClick(item: NavItem) {
    // admin buttons: locked unless admin logged
    if (item.adminOnly && !isAdminLogged) return;

    // employee pages: require code first
    if (item.requiresEmployeeCode && !canAccessEmployeePages) {
      setPendingHref(item.href);
      setShowCodeModal(true);
      return;
    }

    // if employee page, pass code for MVP
    if (item.requiresEmployeeCode) {
      router.push(`${item.href}?code=${encodeURIComponent(employeeCode.trim())}`);
      return;
    }

    router.push(item.href);
  }

  function confirmEmployeeCode() {
    if (!employeeCode.trim()) return;
    setShowCodeModal(false);
    if (pendingHref) {
      router.push(`${pendingHref}?code=${encodeURIComponent(employeeCode.trim())}`);
      setPendingHref(null);
    }
  }

  async function adminLogin() {
    if (!adminEmail.trim() || adminPassword.length < 6) return;

    setAdminError(null);
    setAdminLoading(true);

    try {
      const res = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });

      if (res.error) {
        setAdminError("Email ou mot de passe invalide.");
        return;
      }

      // make sure Prisma user exists + role is set
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        setAdminError("Connexion OK, mais /api/me a échoué.");
        return;
      }

      const meJson = await meRes.json();
      const role = meJson?.user?.role;

      // strict: only ADMIN/MANAGER gets kiosk admin unlock
      if (role !== "ADMIN" && role !== "MANAGER") {
        setAdminError("Accès refusé.");
        await supabase.auth.signOut();
        return;
      }

      setShowAdminModal(false);
      setAdminPassword("");

      // refresh server page to recompute isAdminLogged
      router.refresh();
    } catch {
      setAdminError("Erreur réseau.");
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <main className="kiosk-shell">
      <div className="kiosk-frame">
        {/* LEFT NAV */}
        <aside className="kiosk-left">
          <div className="kiosk-leftTop" />

          <nav className="kiosk-nav">
            {NAV_ITEMS.slice(0, 4).map((it) => (
              <button
                key={it.label}
                className="kiosk-navBtn"
                type="button"
                onClick={() => onNavClick(it)}
              >
                {it.label}
              </button>
            ))}

            <div className="kiosk-navSpacer" />

            {NAV_ITEMS.slice(4).map((it) => {
              const locked = it.adminOnly && !isAdminLogged;
              return (
                <button
                  key={it.label}
                  className={`kiosk-navBtn ${locked ? "locked" : ""}`}
                  type="button"
                  onClick={() => onNavClick(it)}
                  disabled={locked}
                  title={locked ? "Admin only" : undefined}
                >
                  <span>{it.label}</span>
                  {locked && <span className="lockBadge">🔒</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* CENTER */}
        <section className="kiosk-center">
          <h1 className="kiosk-title">Entrez votre code</h1>

          <div className="kiosk-display" aria-label="Code display">
            {employeeCode}
          </div>

          <div className="kiosk-pad">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <button
                key={d}
                className="kiosk-key"
                type="button"
                onClick={() => setEmployeeCode((p) => (p.length >= 10 ? p : p + d))}
              >
                {d}
              </button>
            ))}

            <div className="kiosk-padBottom">
              <button
                className="kiosk-key"
                type="button"
                onClick={() => setEmployeeCode((p) => (p.length >= 10 ? p : p + "0"))}
              >
                0
              </button>
              <button
                className="kiosk-key kiosk-keyDanger"
                type="button"
                onClick={() => setEmployeeCode((p) => p.slice(0, -1))}
              >
                X
              </button>
            </div>
          </div>

          <div className="kiosk-actions">
            <button className="kiosk-actionBtn" type="button" onClick={() => setEmployeeCode("")}>
              Clear
            </button>
            <button
              className="kiosk-actionBtn kiosk-actionPrimary"
              type="button"
              onClick={() => setShowCodeModal(true)}
            >
              OK
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN (Admin + Actifs) */}
        <aside className="kiosk-rightCol">
          <div className="rightTop">
            <button
              className="kiosk-adminBtn"
              type="button"
              onClick={() => {
                setAdminError(null);
                setAdminPassword("");
                setShowAdminModal(true);
              }}
            >
              Admin
            </button>
          </div>

          <div className="kiosk-actifsCard">
            <div className="kiosk-actifsTitle">Actifs:</div>

            <div className="kiosk-table">
              <div className="kiosk-row kiosk-head">
                <div>Nom</div>
                <div>Status</div>
                <div>Temps</div>
              </div>

              {actifs.length === 0 ? (
                <>
                  <div className="kiosk-emptyNote">Aucun actif</div>
                  <div className="kiosk-row empty"><div /></div>
                  <div className="kiosk-row empty"><div /></div>
                  <div className="kiosk-row empty"><div /></div>
                </>
              ) : (
                actifs.map((r) => (
                  <div key={r.name} className="kiosk-row">
                    <div className="kiosk-name">{r.name}</div>
                    <div className="kiosk-statusCell">
                      <span className={`kiosk-dot ${r.status}`} aria-hidden="true" />
                    </div>
                    <div className="kiosk-time">{r.time}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* EMPLOYEE CODE MODAL */}
      {showCodeModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.target === e.currentTarget && setShowCodeModal(false)}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Code employé</h2>
              <button className="ghost" type="button" onClick={() => setShowCodeModal(false)}>
                ✕
              </button>
            </div>

            <p className="modal-sub">Entrez votre code pour accéder aux pages.</p>

            <input
              className="input"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              placeholder="Ex: 7931"
              autoFocus
            />

            <button
              className="primary"
              type="button"
              onClick={confirmEmployeeCode}
              disabled={!employeeCode.trim()}
              style={{ marginTop: 12 }}
            >
              Continuer
            </button>

            <button
              className="secondary"
              type="button"
              onClick={() => setShowCodeModal(false)}
              style={{ marginTop: 8 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ADMIN LOGIN MODAL */}
      {showAdminModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.target === e.currentTarget && setShowAdminModal(false)}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Admin</h2>
              <button
                className="ghost"
                type="button"
                onClick={() => setShowAdminModal(false)}
                disabled={adminLoading}
              >
                ✕
              </button>
            </div>

            <p className="modal-sub">Connexion admin (email + mot de passe).</p>

            <label className="label">Email</label>
            <input
              className="input"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              autoComplete="email"
              disabled={adminLoading}
            />

            <label className="label" style={{ marginTop: 10 }}>
              Mot de passe
            </label>
            <input
              className="input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              disabled={adminLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") adminLogin();
              }}
            />

            {adminError && (
              <div className="alert" role="alert" style={{ marginTop: 10 }}>
                <span className="alert-dot" aria-hidden="true" />
                <p className="alert-text">{adminError}</p>
              </div>
            )}

            <button
              className="primary"
              type="button"
              onClick={adminLogin}
              disabled={adminLoading || !adminEmail.trim() || adminPassword.length < 6}
              style={{ marginTop: 12 }}
            >
              {adminLoading ? "..." : "Se connecter"}
            </button>

            <button
              className="secondary"
              type="button"
              onClick={() => setShowAdminModal(false)}
              disabled={adminLoading}
              style={{ marginTop: 8 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
