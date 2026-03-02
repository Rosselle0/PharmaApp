"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import KioskSidebar from "@/components/KioskSidebar"; // ✅ new sidebar
import "./kiosk.css";

type NavItem = {
  label: string;
  href: string;
  requiresEmployeeCode?: boolean;
  adminOnly?: boolean;
};

type ApiActif = {
  employeeId: string;
  name: string;
  state: "WORKING" | "BREAK" | "LUNCH" | "LEFT";
  minutes: number;
};

type ActiveRow = {
  name: string;
  status: "GREEN" | "YELLOW" | "RED" | "GRAY";
  time: string;
};

const PIN_LEN = 4;

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

  // Employee kiosk login
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

  const canAccessLogs = useMemo(() => {
    if (isPrivilegedLogged) return true;
    return employeeLogged && (kioskRole === "ADMIN" || kioskRole === "MANAGER");
  }, [isPrivilegedLogged, employeeLogged, kioskRole]);

  const [actifs, setActifs] = useState<ActiveRow[]>([]);
  const [actifsErr, setActifsErr] = useState<string | null>(null);

  function mapStateToUi(state: string): ActiveRow["status"] {
    const s = String(state || "").toUpperCase();
    if (s === "WORKING" || s === "IN") return "GREEN";
    if (s === "BREAK" || s === "ON_BREAK") return "YELLOW";
    if (s === "LUNCH" || s === "ON_LUNCH") return "YELLOW";
    if (s === "LEFT" || s === "OUT") return "RED";
    return "GRAY";
  }

  function fmtMinutes(min: number) {
    if (!Number.isFinite(min) || min < 0) return "0 min";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }

  async function loadActifs() {
    try {
      setActifsErr(null);
      const params = new URLSearchParams(window.location.search);
      const urlCode = (params.get("code") ?? "").trim();
      const url = urlCode
        ? `/api/kiosk/actifs?code=${encodeURIComponent(urlCode)}`
        : `/api/kiosk/actifs`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setActifs([]);
        setActifsErr(data?.error ?? `Erreur (${res.status})`);
        return;
      }
      const apiRows: ApiActif[] = Array.isArray(data.actifs) ? data.actifs : [];
      const uiRows: ActiveRow[] = apiRows.map((r) => ({
        name: r.name,
        status: mapStateToUi(r.state),
        time: fmtMinutes(Number(r.minutes ?? 0)),
      }));
      setActifs(uiRows);
    } catch (e: any) {
      setActifs([]);
      setActifsErr("Erreur réseau (actifs).");
    }
  }

  async function punch(type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "LUNCH_START" | "LUNCH_END") {
    try {
      const code = employeeCodeConfirmed || employeeCodeClean;
      if (!code || code.length !== PIN_LEN) {
        showToast("Code requis pour punch.");
        return;
      }
      const url = new URL("/api/punch", window.location.origin);
      url.searchParams.set("code", code);
      url.searchParams.set("dev", "1");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error ?? `Erreur (${res.status})`);
        return;
      }
      showToast(`✅ ${type}`);
      loadActifs();
    } catch {
      showToast("Erreur réseau punch.");
    }
  }

  useEffect(() => {
    loadActifs();
    const t = window.setInterval(loadActifs, 5000);
    return () => window.clearInterval(t);
  }, []);

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
    localStorage.removeItem("kiosk_role");
  }

  // Restore kioskRole
  useEffect(() => {
    const r = (localStorage.getItem("kiosk_role") ?? "").trim();
    setKioskRole(r || null);
  }, []);

  // PIN keyboard logic (kept from Code2)
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
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setPinError(false);
        setEmployeeCode((p) => p.slice(0, -1));
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setEmployeeCode("");
        setPinError(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPrivilegedLogged, employeeLogged]);

  // auto-submit
  useEffect(() => {
    if (isPrivilegedLogged || employeeLogged || autoSubmitting) return;
    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN || blockedCode === clean) return;
    setAutoSubmitting(true);
    employeeConfirm(clean).finally(() => setAutoSubmitting(false));
  }, [employeeCode, isPrivilegedLogged, employeeLogged, autoSubmitting, blockedCode]);

  async function employeeConfirm(forcedCode?: string) {
    const clean = (forcedCode ?? employeeCode).replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN) {
      setPinError(true);
      showToast("Entrez un code valide.");
      setTimeout(() => setPinError(false), 700);
      return;
    }
    const res = await fetch("/api/kiosk/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: clean }),
    });
    if (!res.ok) {
      setPinError(true);
      return;
    }
    const data = await res.json().catch(() => null);
    const roleFromApi = String(data?.employee?.role ?? "EMPLOYEE").toUpperCase();
    const last = data?.employee?.lastName ?? "";
    const full = last.trim();
    setPinError(false);
    setPinSuccess(true);
    setPinFlash(true);
    setTimeout(() => setPinFlash(false), 650);
    setTimeout(() => {
      setEmployeeLogged(true);
      setEmployeeCodeConfirmed(clean);
      setEmployeeName(full);
      saveEmployeeSession(clean, full, roleFromApi);
      setKioskRole(roleFromApi);
      router.replace(`/kiosk?code=${encodeURIComponent(clean)}`);
    }, 650);
  }

  async function employeeLogout() {
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
    loadActifs();
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
      if (res.error) throw new Error(res.error.message);
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) throw new Error("Failed /api/me");
      const meJson = await meRes.json();
      const role = String(meJson?.user?.role ?? "").toUpperCase();
      if (role !== "ADMIN" && role !== "MANAGER") throw new Error(`Accès refusé. Role=${role || "NONE"}`);
      localStorage.setItem("kiosk_role", role);
      setKioskRole(role);
      employeeLogout();
      router.replace("/kiosk");
      setShowAdminModal(false);
    } catch (err: any) {
      setAdminError(err.message || "Erreur réseau.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function adminLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("kiosk_role");
    setKioskRole(null);
    router.refresh();
  }

  return (
  <main className="kiosk-shell">
    <div className="kiosk-frame">
      {/* LEFT SIDEBAR (from Code1) */}
      <Suspense fallback={<div>Loading menu…</div>}>
        <KioskSidebar
        isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={employeeCode} />
      </Suspense>

      {/* CENTER CONTENT (keep Code2 UI as-is) */}
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
              <span className="loggedCheck" aria-hidden="true">✓</span>
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

        {/* KEYPAD + ACTIONS */}
        {!isAnyLogged && (
          <>
            <div className="kiosk-pad">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
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

        {/* PUNCH PANEL */}
        {employeeLogged && !isPrivilegedLogged && (
          <div className="punchPanel">
            <div className="punchTitle">Punch</div>
            <div className="punchBtns">
              <button className="punchBtn" type="button" onClick={() => punch("CLOCK_IN")}>IN</button>
              <button className="punchBtn" type="button" onClick={() => punch("BREAK_START")}>Break</button>
              <button className="punchBtn" type="button" onClick={() => punch("BREAK_END")}>Back</button>
              <button className="punchBtn" type="button" onClick={() => punch("LUNCH_START")}>Lunch</button>
              <button className="punchBtn" type="button" onClick={() => punch("LUNCH_END")}>Back</button>
              <button className="punchBtn punchBtnDanger" type="button" onClick={() => punch("CLOCK_OUT")}>OUT</button>
            </div>
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
            {actifsErr && (
              <div style={{ marginTop: 8, color: "#f04438", fontWeight: 800 }}>
                {actifsErr}
              </div>
            )}

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

    {/* Admin Modal */}
    {showAdminModal && !isPrivilegedLogged && (
      <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowAdminModal(false)}>
        <div className="modal-card">
          <div className="modal-head">
            <h2 className="modal-title">Admin</h2>
            <button className="ghost" type="button" onClick={() => setShowAdminModal(false)} disabled={adminLoading}>✕</button>
          </div>
          <p className="modal-sub">Connexion admin (email + mot de passe).</p>
          <label>Email</label>
          <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} disabled={adminLoading} />
          <label style={{ marginTop: 10 }}>Mot de passe</label>
          <input value={adminPassword} type="password" onChange={(e) => setAdminPassword(e.target.value)} disabled={adminLoading} onKeyDown={(e) => { if (e.key === "Enter") adminLogin(); }} />
          {adminError && <div className="alert">{adminError}</div>}
          <button className="primary" onClick={adminLogin} disabled={adminLoading || !adminEmail.trim() || adminPassword.length < 6}>Se connecter</button>
          <button className="secondary" onClick={() => setShowAdminModal(false)} disabled={adminLoading}>Annuler</button>
        </div>
      </div>
    )}

    {/* Toast */}
    {toast && <div className="kiosk-toast">{toast}</div>}
  </main>
);
}