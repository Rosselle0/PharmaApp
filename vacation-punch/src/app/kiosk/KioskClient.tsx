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
  { label: "Horaire", href: "/schedule", requiresEmployeeCode: true },
  { label: "Changement", href: "/change", requiresEmployeeCode: true },
  { label: "Task list", href: "/tasks", requiresEmployeeCode: true },
  { label: "Conge", href: "/vacation", requiresEmployeeCode: true },

  { label: "Modifier c", href: "/admin/modify", adminOnly: true },
  { label: "Creation c", href: "/admin/create-account", adminOnly: true },
  { label: "Creation T", href: "/admin/creation-t", adminOnly: true },
  { label: "Creation h", href: "/schedule/edit", adminOnly: true },
];

type ActiveRow = { name: string; status: "GREEN" | "RED" | "GRAY"; time: string };

const PIN_LEN = 4;

export default function KioskClient({
  isAdminLogged,
  adminName,
}: {
  isAdminLogged: boolean;
  adminName?: string;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [employeeCodeConfirmed, setEmployeeCodeConfirmed] = useState<string | null>(null);
  // employee kiosk login
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeLogged, setEmployeeLogged] = useState(false);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinFlash, setPinFlash] = useState(false); // triggers animation


  useEffect(() => {
    if (isAdminLogged) return; // admin doesn't need kiosk restore

    // read URL: /kiosk?code=1234
    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);

    // read storage
    const lsLogged = localStorage.getItem("kiosk_employee_logged") === "1";
    const lsCode = (localStorage.getItem("kiosk_employee_code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
    const lsName = (localStorage.getItem("kiosk_employee_name") ?? "").trim();

    const finalCode = urlCode.length === PIN_LEN ? urlCode : lsCode;

    if ((urlCode.length === PIN_LEN) || (lsLogged && finalCode.length === PIN_LEN)) {
      setEmployeeCode(finalCode);
      setEmployeeCodeConfirmed(finalCode);
      setEmployeeLogged(true);
      setEmployeeName(lsName || null);
      setPinError(false);

      // keep storage synced
      localStorage.setItem("kiosk_employee_logged", "1");
      localStorage.setItem("kiosk_employee_code", finalCode);
      localStorage.setItem("kiosk_employee_name", lsName);
    }
  }, [isAdminLogged]);


  // PIN UI state
  const [pinError, setPinError] = useState(false);
  useEffect(() => {
    // Only when employee mode (not admin) and not already logged
    if (isAdminLogged || employeeLogged) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal typing from inputs/modals
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.getAttribute("contenteditable") === "true") return;

      // ---- DIGITS (top row + numpad) ----
      // e.key handles most cases ("1"), e.code helps for numpad
      const isDigitKey = e.key >= "0" && e.key <= "9";
      const isNumpadDigit = /^Numpad[0-9]$/.test(e.code);

      if (isDigitKey || isNumpadDigit) {
        e.preventDefault();
        setPinError(false);

        const digit = isNumpadDigit ? e.code.replace("Numpad", "") : e.key;

        setEmployeeCode((p) => {
          const next = (p + digit).replace(/\D/g, "").slice(0, PIN_LEN);
          return next;
        });
        return;
      }

      // ---- ERASE (Backspace / Delete) ----
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setPinError(false);
        setEmployeeCode((p) => p.slice(0, -1));
        return;
      }


      // ---- CLEAR (Escape) optional but nice ----
      if (e.key === "Escape") {
        e.preventDefault();
        setEmployeeCode("");
        setPinError(false);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdminLogged, employeeLogged, employeeCode]);

  useEffect(() => {
    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);

    // if user changed the code (or erased), unlock auto submit again
    if (!blockedCode) return;
    if (clean !== blockedCode) setBlockedCode(null);
  }, [employeeCode, blockedCode]);


  useEffect(() => {
    if (isAdminLogged) return;
    if (employeeLogged) return;
    if (autoSubmitting) return;

    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN) return;

    // stop loops: don't resubmit the same failed code
    if (blockedCode === clean) return;

    setAutoSubmitting(true);
    employeeConfirm(clean).finally(() => setAutoSubmitting(false));
  }, [employeeCode, isAdminLogged, employeeLogged, autoSubmitting, blockedCode]);




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

  const isAnyLogged = isAdminLogged || employeeLogged;
  const employeeCodeClean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
  const canAccessEmployeePages = useMemo(
    () => isAdminLogged || (employeeLogged && employeeCodeClean.length === PIN_LEN),
    [isAdminLogged, employeeLogged, employeeCodeClean]
  );
  function saveEmployeeSession(code: string, name: string | null) {
    localStorage.setItem("kiosk_employee_logged", "1");
    localStorage.setItem("kiosk_employee_code", code);
    localStorage.setItem("kiosk_employee_name", name ?? "");
  }

  function clearEmployeeSession() {
    localStorage.removeItem("kiosk_employee_logged");
    localStorage.removeItem("kiosk_employee_code");
    localStorage.removeItem("kiosk_employee_name");
  }

  // Actifs empty at start (keep as-is for now)
  const actifs: ActiveRow[] = [];

  function maskedPinBoxes(value: string) {
    const digits = value.slice(0, PIN_LEN);
    const boxes = Array.from({ length: PIN_LEN }, (_, i) => digits[i] ?? "");
    return boxes;
  }

  function onNavClick(item: NavItem) {
    // admin routes locked unless admin logged
    if (item.adminOnly && !isAdminLogged) {
      showToast("Accès admin requis.");
      return;
    }

    // employee pages require employee login (admins allowed too)
    if (item.requiresEmployeeCode && !canAccessEmployeePages) {
      showToast("Veuillez entrer votre code.");
      return;
    }

    // ✅ ADMIN: never append ?code=...
    if (item.requiresEmployeeCode && isAdminLogged) {
      router.push(item.href);
      return;
    }

    // ✅ EMPLOYEE: always append the saved 4-digit code
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
      //  invalid => red UI, keep user on pin screen
      setEmployeeLogged(false);
      setEmployeeCodeConfirmed(null);
      setEmployeeName(null);
      setBlockedCode(clean);
      setPinError(true);
      showToast("Code invalide.");
      window.setTimeout(() => setPinError(false), 900);

      // keep the typed code so they can delete/correct
      return;
    }

    const data = await res.json().catch(() => null);
    const last = data?.employee?.lastName ? String(data.employee.lastName) : "";
    const full = `${last}`.trim();

    // valid => green UI and logged in
    setPinError(false);
    setPinSuccess(true);
    setPinFlash(true);
    window.setTimeout(() => setPinFlash(false), 650);

    window.setTimeout(() => {
      setEmployeeLogged(true);
      setEmployeeCodeConfirmed(clean);
      setEmployeeName(full);

      saveEmployeeSession(clean, full);
      router.replace(`/kiosk?code=${encodeURIComponent(clean)}`);
    }, 650);
  }

  function employeeLogout() {
    // auth state
    setEmployeeLogged(false);
    setEmployeeCodeConfirmed(null);
    setEmployeeName(null);

    // PIN state
    setEmployeeCode("");
    setPinError(false);
    setPinSuccess(false);
    setPinFlash(false);
    setAutoSubmitting(false);

    // cleanup
    clearEmployeeSession();

    // optional: clean URL so kiosk is truly reset
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
          {!isAnyLogged ? (
            <h1 className="kiosk-title">Bienvenue</h1>
          ) : (
            <h1 className="kiosk-title kiosk-titleLogged">
              {isAdminLogged
                ? `Bonjour ${adminName || "Admin"}`
                : `Salut ${employeeName}`}
            </h1>

          )}
          {isAnyLogged && (
            <div className="loggedWrap">
              <div className="loggedBrand">
                <img
                  src="/Logo-ACC.png"
                  alt="Accès Pharma"
                  className="brandLogo"
                  draggable={false}
                />
              </div>

              <div className="loggedStatus">
                <span className="loggedCheck" aria-hidden="true">✓</span>
                <div className="loggedStatusText">
                  <div className="loggedStatusTitle">Accès autorisé</div>
                  <div className="loggedStatusSub">Session active — vous pouvez naviguer.</div>
                </div>
              </div>
            </div>
          )}



          {/* PIN DISPLAY (reference style) */}
          <div
            className={[
              "pinWrap",
              pinError ? "pinError" : "",
              pinSuccess ? "pinSuccess" : "",
              pinFlash ? "pinFlash" : "",
              isAnyLogged ? "pinSuccess" : "",
            ].join(" ")}
          >

            {!isAnyLogged ? (
              <>
                <div className="pinTitle">Entrez votre pin</div>

                <div className="pinBoxes" role="group" aria-label="PIN">
                  {maskedPinBoxes(employeeCode).map((ch, idx) => (
                    <div key={idx} className="pinBox">
                      <span className="pinStar">{ch ? "•" : ""}</span>
                    </div>
                  ))}
                </div>

                <div className="pinHint">
                  {pinError ? (
                    <span className="pinOops">Oops! Wrong PIN</span>
                  ) : (
                    <span>&nbsp;</span>
                  )}
                </div>
              </>
            ) : (
              <div className="pinSuccessBadge" aria-label="Unlocked">
                <span className="pinCheck">✓</span>
                <span className="pinOkText">Accès autorisé</span>
              </div>
            )}
          </div>

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

                <button
                  className="kiosk-actionBtn kiosk-actionPrimary"
                  type="button"
                  onClick={() => employeeConfirm()}

                >
                  OK
                </button>
              </div>
            </>
          )}

          {/* EMPLOYEE LOGOUT ACTIONS */}
          {employeeLogged && !isAdminLogged && (
            <div className="kiosk-actions">
              <button
                className="kiosk-actionBtn kiosk-actionPrimary"
                type="button"
                onClick={employeeLogout}
              >
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
                if (isAdminLogged) {
                  adminLogout();
                  return;
                }
                setAdminError(null);
                setAdminPassword("");
                setShowAdminModal(true);
              }}
            >
              {isAdminLogged ? "Se déconnecter" : "Admin"}
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
      {showAdminModal && !isAdminLogged && (
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

      {/* TOAST */}
      {toast && (
        <div className="kiosk-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}
