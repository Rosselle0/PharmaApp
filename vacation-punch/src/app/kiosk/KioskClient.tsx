"use client";

import { useEffect, useMemo, useState } from "react";
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
  { label: "Horaire📅", href: "/schedule", requiresEmployeeCode: true },
  { label: "Changement🔁", href: "/change", requiresEmployeeCode: true },
  { label: "Liste des tâches📋", href: "/task-list", requiresEmployeeCode: true },
  { label: "Vacance/Congé🌴", href: "/vacation", requiresEmployeeCode: true },

  { label: "Modifier c", href: "/admin/modify", adminOnly: true },
  { label: "Creation c", href: "/admin/create-account", adminOnly: true },
  { label: "Creation T", href: "/admin/creation-t", adminOnly: true },
  { label: "Creation h", href: "/schedule/edit", adminOnly: true },
];

type ActiveRow = { name: string; status: "GREEN" | "RED" | "GRAY"; time: string };

const PIN_LEN = 8;

export default function KioskClient({
  isAdminLogged,
  adminName,
  isManagerLogged,
}: {
  isAdminLogged: boolean;
  adminName?: string;
  isManagerLogged: boolean;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const isPrivilegedLogged = isAdminLogged || isManagerLogged;

  // employee kiosk login
  const [employeeCodeConfirmed, setEmployeeCodeConfirmed] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeLogged, setEmployeeLogged] = useState(false);
  const [employeeName, setEmployeeName] = useState<string | null>(null);

  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);

  // PIN UI state
  const [pinError, setPinError] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinFlash, setPinFlash] = useState(false);

  // role stored locally for kiosk-only gating (employee/admin)
  const [kioskRole, setKioskRole] = useState<string | null>(null);

  // admin modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  const isAnyLogged = isPrivilegedLogged || employeeLogged;

  const employeeCodeClean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);

  const canAccessEmployeePages = useMemo(
    () => isPrivilegedLogged || (employeeLogged && employeeCodeClean.length === PIN_LEN),
    [isPrivilegedLogged, employeeLogged, employeeCodeClean]
  );

  // Logs should be allowed when ADMIN or MANAGER (either via real auth OR kioskRole)
  const canAccessLogs = useMemo(() => {
    if (isPrivilegedLogged) return true;
    return kioskRole === "ADMIN" || kioskRole === "MANAGER";
  }, [isPrivilegedLogged, kioskRole]);

  // Actifs empty at start (keep as-is for now)
  const actifs: ActiveRow[] = [];

  function maskedPinBoxes(value: string) {
    const digits = value.slice(0, PIN_LEN);
    return Array.from({ length: PIN_LEN }, (_, i) => digits[i] ?? "");
  }

function saveEmployeeSession(code: string, name: string | null, role: string) {
  const r = String(role ?? "").toUpperCase();
  localStorage.setItem("kiosk_employee_logged", "1");
  localStorage.setItem("kiosk_employee_code", code);
  localStorage.setItem("kiosk_employee_name", name ?? "");
  localStorage.setItem("kiosk_role", r);
}



function clearEmployeeSession() {
  localStorage.removeItem("kiosk_employee_logged");
  localStorage.removeItem("kiosk_employee_code");
  localStorage.removeItem("kiosk_employee_name");
  localStorage.removeItem("kiosk_role"); // ✅ remove it too
}


  // restore kioskRole on mount
  useEffect(() => {
    const r = (localStorage.getItem("kiosk_role") ?? "").trim();
    setKioskRole(r || null);
  }, []);

  // restore employee kiosk session (only if no admin/manager logged)
  useEffect(() => {
    if (isPrivilegedLogged) return;

    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);

    const lsLogged = localStorage.getItem("kiosk_employee_logged") === "1";
    const lsCode = (localStorage.getItem("kiosk_employee_code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
    const lsName = (localStorage.getItem("kiosk_employee_name") ?? "").trim();
    const lsRole = (localStorage.getItem("kiosk_role") ?? "").trim();

    const finalCode = urlCode.length === PIN_LEN ? urlCode : lsCode;

    if (urlCode.length === PIN_LEN || (lsLogged && finalCode.length === PIN_LEN)) {
      setEmployeeCode(finalCode);
      setEmployeeCodeConfirmed(finalCode);
      setEmployeeLogged(true);
      setEmployeeName(lsName || null);
      setPinError(false);

      // keep storage synced
      localStorage.setItem("kiosk_employee_logged", "1");
      localStorage.setItem("kiosk_employee_code", finalCode);
      localStorage.setItem("kiosk_employee_name", lsName);
      if (lsRole) {
        localStorage.setItem("kiosk_role", lsRole);
        setKioskRole(lsRole);
      }
    }
  }, [isPrivilegedLogged]);

  // keyboard capture for PIN (only when employee mode and not logged)
  useEffect(() => {
    if (isPrivilegedLogged || employeeLogged) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.getAttribute("contenteditable") === "true") return;

      const isDigitKey = e.key >= "0" && e.key <= "9";
      const isNumpadDigit = /^Numpad[0-9]$/.test(e.code);

      if (isDigitKey || isNumpadDigit) {
        e.preventDefault();
        setPinError(false);

        const digit = isNumpadDigit ? e.code.replace("Numpad", "") : e.key;
        setEmployeeCode((p) => (p + digit).replace(/\D/g, "").slice(0, PIN_LEN));
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setPinError(false);
        setEmployeeCode((p) => p.slice(0, -1));
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setEmployeeCode("");
        setPinError(false);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPrivilegedLogged, employeeLogged]);

  // unblock auto submit if user changes code
  useEffect(() => {
    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (!blockedCode) return;
    if (clean !== blockedCode) setBlockedCode(null);
  }, [employeeCode, blockedCode]);

  // auto-submit when PIN complete
  useEffect(() => {
    if (isPrivilegedLogged) return;
    if (employeeLogged) return;
    if (autoSubmitting) return;

    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN) return;
    if (blockedCode === clean) return;

    setAutoSubmitting(true);
    employeeConfirm(clean).finally(() => setAutoSubmitting(false));
  }, [employeeCode, isPrivilegedLogged, employeeLogged, autoSubmitting, blockedCode]);

  function onNavClick(item: NavItem) {
    if (item.adminOnly && !isPrivilegedLogged) {
      showToast("Accès admin requis.");
      return;
    }

    if (item.requiresEmployeeCode && !canAccessEmployeePages) {
      showToast("Veuillez entrer votre code.");
      return;
    }

    // privileged: never append ?code=
    if (item.requiresEmployeeCode && isPrivilegedLogged) {
      router.push(item.href);
      return;
    }

    // employee: append ?code=
    if (item.requiresEmployeeCode) {
      router.push(`${item.href}?code=${encodeURIComponent(employeeCodeClean)}`);
      return;
    }

    router.push(item.href);
  }

async function employeeConfirm(forcedCode?: string) {
  const clean = (forcedCode ?? employeeCode).replace(/\D/g, "").slice(0, PIN_LEN);

  if (clean.length !== PIN_LEN) {
    setPinError(true);
    showToast("Entrez un code valide.");
    window.setTimeout(() => setPinError(false), 700);
    return;
  }

  const res = await fetch("/api/kiosk/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: clean }),
  });

  if (!res.ok) {
    setPinSuccess(false);
    setPinFlash(false);

    setEmployeeLogged(false);
    setEmployeeCodeConfirmed(null);
    setEmployeeName(null);

    setBlockedCode(clean);
    setPinError(true);
    window.setTimeout(() => setPinError(false), 900);
    return;
  }

  const data = await res.json().catch(() => null);

  // ✅ normalize role ONCE
  const roleFromApi = String(data?.employee?.role ?? "EMPLOYEE").toUpperCase();

  // last name only (kept your behavior)
  const last = data?.employee?.lastName ? String(data.employee.lastName) : "";
  const full = last.trim();

  setPinError(false);
  setPinSuccess(true);
  setPinFlash(true);
  window.setTimeout(() => setPinFlash(false), 650);

  window.setTimeout(() => {
    setEmployeeLogged(true);
    setEmployeeCodeConfirmed(clean);
    setEmployeeName(full);

    // ✅ sync storage + state (NO REFRESH REQUIRED)
    saveEmployeeSession(clean, full, roleFromApi);
    setKioskRole(roleFromApi);

    router.replace(`/kiosk?code=${encodeURIComponent(clean)}`);
  }, 650);
}


  function employeeLogout() {
    setEmployeeLogged(false);
    setEmployeeCodeConfirmed(null);
    setEmployeeName(null);

    setEmployeeCode("");
    setPinError(false);
    setPinSuccess(false);
    setPinFlash(false);
    setAutoSubmitting(false);
    setBlockedCode(null);

    clearEmployeeSession();
    router.replace("/kiosk");
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

      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        setAdminError("Connexion OK, mais /api/me a échoué.");
        return;
      }

      const meJson = await meRes.json();
      const role = String(meJson?.user?.role ?? "").toUpperCase();

      if (role !== "ADMIN" && role !== "MANAGER") {
        setAdminError("Accès refusé.");
        await supabase.auth.signOut();
        return;
      }

      // store role so Logs button can unlock immediately if needed
      localStorage.setItem("kiosk_role", role);
      setKioskRole(role);

      // wipe employee state
      setEmployeeLogged(false);
      setEmployeeCodeConfirmed(null);
      setEmployeeName(null);
      setEmployeeCode("");
      setPinError(false);
      setPinSuccess(false);
      setPinFlash(false);
      setAutoSubmitting(false);
      setBlockedCode(null);
      clearEmployeeSession();

      router.replace("/kiosk");
      setShowAdminModal(false);
      setAdminPassword("");
      router.refresh();
    } catch {
      setAdminError("Erreur réseau.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function adminLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      // optional: clear kiosk role on admin logout too
      localStorage.removeItem("kiosk_role");
      setKioskRole(null);
      router.refresh();
    }
  }

  return (
    <main className="kiosk-shell">
      <div className="kiosk-frame">
        {/* LEFT NAV */}
        <aside className="kiosk-left">
          <div className="kiosk-leftTop" />

          <nav className="kiosk-nav">
            <div className="kiosk-navMain">
              {NAV_ITEMS.slice(0, 4).map((it) => (
                <button key={it.label} className="kiosk-navBtn" type="button" onClick={() => onNavClick(it)}>
                  {it.label}
                </button>
              ))}
            </div>

            <div className="kiosk-navBottom">
              <button
                className="kiosk-navBtn kiosk-navLogs"
                type="button"
                onClick={() => router.push("/admin/dashboard")}
                disabled={!canAccessLogs}
                title={!canAccessLogs ? "Connexion admin ou manager requise" : undefined}
              >
                <span>Logs</span>
                {!canAccessLogs && <span className="lockBadge">🔒</span>}
              </button>
            </div>
          </nav>
        </aside>

        {/* CENTER */}
        <section className="kiosk-center">
          {!isAnyLogged ? (
            <h1 className="kiosk-title">Bienvenue</h1>
          ) : (
            <h1 className="kiosk-title kiosk-titleLogged">
              {isPrivilegedLogged ? `Bonjour ${adminName || "Admin"}` : `Salut ${employeeName}`}
            </h1>
          )}

          {isAnyLogged && (
            <div className="loggedWrap">
              <div className="loggedBrand">
                <img src="/Logo-ACC.png" alt="Accès Pharma" className="brandLogo" draggable={false} />
              </div>

              <div className="loggedStatus">
                <span className="loggedCheck" aria-hidden="true">
                  ✓
                </span>
                <div className="loggedStatusText">
                  <div className="loggedStatusTitle">Accès autorisé</div>
                  <div className="loggedStatusSub">Session active — vous pouvez naviguer.</div>
                </div>
              </div>
            </div>
          )}

          {/* PIN DISPLAY */}
          {!isAnyLogged && (
            <div
              className={[
                "pinWrap",
                pinError ? "pinWrap--error" : "",
                pinSuccess ? "pinWrap--success" : "",
                pinFlash ? "pinWrap--flash" : "",
              ].join(" ")}
            >
              <div className="pinTitle">Entrez votre pin</div>

              <div className="pinBoxes" role="group" aria-label="PIN">
                {maskedPinBoxes(employeeCode).map((ch, idx) => (
                  <div key={idx} className="pinBox">
                    <span className="pinStar">{ch ? "•" : ""}</span>
                  </div>
                ))}
              </div>

              <div className="pinHint">
                {pinError ? <span className="pinOops">Oops! Pin invalide</span> : <span>{"\u00A0"}</span>}
              </div>
            </div>
          )}

          {/* SHOW KEYPAD ONLY WHEN NOT LOGGED */}
          {!isAnyLogged && (
            <>
              <div className="kiosk-pad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    className="kiosk-key"
                    type="button"
                    onClick={() => {
                      setPinError(false);
                      setEmployeeCode((p) => (p + d).replace(/\D/g, "").slice(0, PIN_LEN));
                    }}
                  >
                    {d}
                  </button>
                ))}

                <div className="kiosk-padBottom">
                  <button
                    className="kiosk-key"
                    type="button"
                    onClick={() => {
                      setPinError(false);
                      setEmployeeCode((p) => (p + "0").replace(/\D/g, "").slice(0, PIN_LEN));
                    }}
                  >
                    0
                  </button>

                  <button
                    className="kiosk-key kiosk-keyDanger"
                    type="button"
                    onClick={() => {
                      setEmployeeCode((p) => p.slice(0, -1));
                      setPinError(false);
                    }}
                  >
                    ⌫
                  </button>
                </div>
              </div>

              <div className="kiosk-actions">
                <button
                  className="kiosk-actionBtn"
                  type="button"
                  onClick={() => {
                    setEmployeeCode("");
                    setEmployeeLogged(false);
                    setEmployeeCodeConfirmed(null);
                    setEmployeeName(null);
                    setPinError(false);
                  }}
                >
                  Clear
                </button>

                <button className="kiosk-actionBtn kiosk-actionPrimary" type="button" onClick={() => employeeConfirm()}>
                  OK
                </button>
              </div>
            </>
          )}

          {/* EMPLOYEE LOGOUT ACTIONS */}
          {employeeLogged && !isPrivilegedLogged && (
            <div className="kiosk-actions">
              <button className="kiosk-actionBtn kiosk-actionPrimary" type="button" onClick={employeeLogout}>
                Se déconnecter
              </button>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN (Admin + Actifs) */}
        <aside className="kiosk-rightCol">
          <div className="adminPanelHead">
            <button
              className="kiosk-adminBtn"
              type="button"
              onClick={() => {
                if (isPrivilegedLogged) {
                  adminLogout();
                  return;
                }
                setAdminError(null);
                setAdminPassword("");
                setShowAdminModal(true);
              }}
            >
              {isPrivilegedLogged ? "Se déconnecter" : "Admin"}
            </button>
          </div>

          <div className="kiosk-actifsCard">
            <div className="kiosk-actifsTitle">Actifs</div>

            <div className="kiosk-table">
              <div className="kiosk-row kiosk-head">
                <div>Nom</div>
                <div>Status</div>
                <div>Temps</div>
              </div>

              {actifs.length === 0 ? (
                <>
                  <div className="kiosk-emptyNote">Aucun actif</div>
                  <div className="kiosk-row empty">
                    <div />
                    <div />
                    <div />
                  </div>
                  <div className="kiosk-row empty">
                    <div />
                    <div />
                    <div />
                  </div>
                  <div className="kiosk-row empty">
                    <div />
                    <div />
                    <div />
                  </div>
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

      {/* ADMIN LOGIN MODAL */}
      {showAdminModal && !isPrivilegedLogged && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.target === e.currentTarget && setShowAdminModal(false)}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Admin</h2>
              <button className="ghost" type="button" onClick={() => setShowAdminModal(false)} disabled={adminLoading}>
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

      {/* TOAST */}
      {toast && (
        <div className="kiosk-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}
