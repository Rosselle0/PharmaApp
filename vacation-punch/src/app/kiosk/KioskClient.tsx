"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import KioskSidebar from "@/components/KioskSidebar";
import "./kiosk.css";

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

type PunchState = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

type PunchAction =
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | "LUNCH_START"
  | "LUNCH_END";

type PunchStatus = {
  state: PunchState;
  breakDone: boolean;
  lunchDone: boolean;
  workMs: number;
  breakMs: number;
  lunchMs: number;
  fetchedAt: string;
};

type OvertimePrompt = {
  shiftId: string;
  overtimeMinutes: number;
};

const PIN_LEN = 4;

type KioskClientProps = {
  isAdminLogged: boolean;
  isManagerLogged: boolean;
  privilegedName?: string;
  privilegedCode?: string;
};

export default function KioskClient({
  isAdminLogged,
  isManagerLogged,
  privilegedName,
  privilegedCode,
}: KioskClientProps) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const isPrivilegedLogged = isAdminLogged || isManagerLogged;

  const [employeeCodeConfirmed, setEmployeeCodeConfirmed] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeLogged, setEmployeeLogged] = useState(false);
  const [employeeName, setEmployeeName] = useState<string | null>(null);

  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [awaitingOtpCode, setAwaitingOtpCode] = useState<string | null>(null);
  const [loginOtp, setLoginOtp] = useState("");
  const [loginOtpMsg, setLoginOtpMsg] = useState<string | null>(null);
  const [loginOtpBusy, setLoginOtpBusy] = useState(false);
  const [otpSending, setOtpSending] = useState(false);

  const [pinError, setPinError] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinFlash, setPinFlash] = useState(false);

  const [kioskRole, setKioskRole] = useState<string | null>(null);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const [overtimePrompt, setOvertimePrompt] = useState<OvertimePrompt | null>(null);
  const [overtimePharmPin, setOvertimePharmPin] = useState("");
  const [overtimePharmBusy, setOvertimePharmBusy] = useState(false);
  const [overtimePharmName, setOvertimePharmName] = useState<string | null>(null);
  const [overtimeError, setOvertimeError] = useState<string | null>(null);

  const [actifsOverlayOpen, setActifsOverlayOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActifsOverlayOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
  const [punchStatus, setPunchStatus] = useState<PunchStatus | null>(null);
  const [punchStateErr, setPunchStateErr] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());

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

function firstWord(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] ?? "";
}


  function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  const effectivePunchCode = employeeCodeConfirmed || (employeeLogged ? employeeCodeClean : "") || privilegedCode || "";

  async function loadPunchState() {
    if (!effectivePunchCode || effectivePunchCode.length !== PIN_LEN) {
      setPunchStatus(null);
      setPunchStateErr(null);
      return;
    }

    try {
      setPunchStateErr(null);
      const res = await fetch("/api/punch/state", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: effectivePunchCode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setPunchStatus(null);
        setPunchStateErr(data?.error ?? `Erreur (${res.status})`);
        return;
      }
      setPunchStatus({
        state: data.state ?? "OUT",
        breakDone: Boolean(data.breakDone),
        lunchDone: Boolean(data.lunchDone),
        workMs: Number(data.workMs ?? 0),
        breakMs: Number(data.breakMs ?? 0),
        lunchMs: Number(data.lunchMs ?? 0),
        fetchedAt: String(data.fetchedAt ?? new Date().toISOString()),
      });
    } catch {
      setPunchStateErr("Erreur réseau punch.");
    }
  }

  function getDisplayedMs(status: PunchStatus | null, nowMs: number) {
    if (!status) return 0;
    const sinceFetch = Math.max(0, nowMs - new Date(status.fetchedAt).getTime());
    if (status.state === "IN") return status.workMs + sinceFetch;
    if (status.state === "ON_BREAK") return status.breakMs + sinceFetch;
    if (status.state === "ON_LUNCH") return status.lunchMs + sinceFetch;
    return 0;
  }

  async function loadActifs() {
    try {
      setActifsErr(null);
      // IMPORTANT:
      // Some navigation/hover actions keep a `?code=...` query in the URL.
      // If we forward it, `/api/kiosk/actifs` filters to only that employee,
      // making the list look like it "disappears". We always want the full list.
      const url = `/api/kiosk/actifs`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setActifsErr(data?.error ?? `Erreur (${res.status})`);
        return;
      }
      const apiRows: ApiActif[] = Array.isArray(data.actifs) ? data.actifs : [];
      const uiRows: ActiveRow[] = apiRows.map((r) => ({
        name: r.name,
        status: mapStateToUi(r.state),
        time: fmtMinutes(Number(r.minutes ?? 0)),
      }));
      // If API temporarily returns empty, keep last successful values so the list doesn't "disappear".
      setActifs((prev) => (uiRows.length === 0 && prev.length > 0 ? prev : uiRows));
    } catch {
      setActifsErr("Erreur réseau (actifs).");
    }
  }

  async function punch(type: PunchAction) {
    try {
      const code = effectivePunchCode;
      if (!code || code.length !== PIN_LEN) {
        showToast("Code requis pour punch.");
        return;
      }
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error ?? `Erreur (${res.status})`);
        return;
      }
      showToast(`✅ ${type}`);

      if (type === "CLOCK_OUT" && data?.overtime?.shiftId && Number(data?.overtime?.overtimeMinutes ?? 0) > 0) {
        setOvertimePharmPin("");
        setOvertimePharmName(null);
        setOvertimeError(null);
        setOvertimePrompt({
          shiftId: String(data.overtime.shiftId),
          overtimeMinutes: Number(data.overtime.overtimeMinutes ?? 0),
        });
      }

      await Promise.all([loadActifs(), loadPunchState()]);
    } catch {
      showToast("Erreur réseau punch.");
    }
  }

  async function signOvertimeAsPharmacien() {
    if (!overtimePrompt) return;
    const pinClean = overtimePharmPin.replace(/\D/g, "").slice(0, PIN_LEN);
    if (!/^\d{4}$/.test(pinClean)) {
      setOvertimeError("PIN pharmacien requis (4 chiffres).");
      return;
    }
    if (overtimePharmBusy) return;

    setOvertimePharmBusy(true);
    setOvertimeError(null);
    try {
      const res = await fetch(`/api/admin/logs/pharmacist-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: overtimePrompt.shiftId, pin: pinClean }),
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setOvertimeError(t || "Signature pharmacien échouée.");
        return;
      }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; pharmacistName?: string } | null;
      setOvertimePharmName(json?.pharmacistName ?? null);
      showToast("Temps supplémentaire signé par le pharmacien.");
      // Close after short success so the employee sees the confirmation.
      window.setTimeout(() => {
        setOvertimePrompt(null);
        setOvertimePharmPin("");
      }, 900);
    } catch {
      setOvertimeError("Erreur réseau (signature pharmacien).");
    } finally {
      setOvertimePharmBusy(false);
    }
  }

  function dismissOvertimePrompt() {
    setOvertimePrompt(null);
    setOvertimePharmPin("");
    setOvertimePharmName(null);
    setOvertimeError(null);
    setOvertimePharmBusy(false);
  }

  useEffect(() => {
    loadActifs();
    const t = window.setInterval(loadActifs, 10000); // reduce DB load on Vercel
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isAnyLogged) {
      setPunchStatus(null);
      setPunchStateErr(null);
      return;
    }

    loadPunchState();
    const refresh = window.setInterval(loadPunchState, 15000);
    const tick = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [isAnyLogged, effectivePunchCode]);

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

  useEffect(() => {
    const storedRole = (localStorage.getItem("kiosk_role") ?? "").trim();
    const storedLogged = localStorage.getItem("kiosk_employee_logged") === "1";
    const storedCode = (localStorage.getItem("kiosk_employee_code") ?? "").trim();
    const storedName = (localStorage.getItem("kiosk_employee_name") ?? "").trim();

    setKioskRole(storedRole || null);

    if (storedLogged && storedCode) {
      setEmployeeLogged(true);
      setEmployeeCodeConfirmed(storedCode);
      setEmployeeCode(storedCode);
      setEmployeeName(storedName || null);
    }
  }, []);

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

  useEffect(() => {
    if (isPrivilegedLogged || employeeLogged || autoSubmitting) return;
    const clean = employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN || blockedCode === clean || awaitingOtpCode === clean) return;
    setAutoSubmitting(true);
    employeeConfirm(clean).finally(() => setAutoSubmitting(false));
  }, [employeeCode, isPrivilegedLogged, employeeLogged, autoSubmitting, blockedCode, awaitingOtpCode]);

  async function employeeConfirm(forcedCode?: string) {
    const clean = (forcedCode ?? employeeCode).replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN) {
      setPinError(true);
      showToast("Entrez un code valide.");
      setTimeout(() => setPinError(false), 700);
      return;
    }

    setOtpSending(true);
    let res: Response;
    let data: any = null;
    try {
      res = await fetch("/api/kiosk/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      data = await res.json().catch(() => null);
    } catch {
      setPinError(true);
      setLoginOtpMsg("Erreur réseau.");
      return;
    } finally {
      setOtpSending(false);
    }

    if (data?.requiresOtp) {
      setAwaitingOtpCode(clean);
      setLoginOtp("");
      setLoginOtpMsg(data?.message ?? "Code envoyé par email.");
      setPinError(false);
      return;
    }

    if (!res.ok) {
      setPinError(true);
      return;
    }

    const roleFromApi = String(data?.employee?.role ?? "EMPLOYEE").toUpperCase();
    const first = data?.employee?.firstName ?? "";
    const displayName = first.trim();

    setPinError(false);
    setPinSuccess(true);
    setPinFlash(true);

    setTimeout(() => setPinFlash(false), 650);
    setTimeout(() => {
      setEmployeeLogged(true);
      setEmployeeCodeConfirmed(clean);
      setEmployeeName(displayName);
      setAwaitingOtpCode(null);
      setLoginOtp("");
      setLoginOtpMsg(null);
      saveEmployeeSession(clean, displayName, roleFromApi);
      setKioskRole(roleFromApi);
      router.replace("/kiosk");
    }, 650);
  }

  async function verifyLoginOtp() {
    const clean = awaitingOtpCode ?? employeeCode.replace(/\D/g, "").slice(0, PIN_LEN);
    if (clean.length !== PIN_LEN) return;
    if (loginOtp.length !== 6) {
      setLoginOtpMsg("Entrez le code à 6 chiffres.");
      return;
    }

    setLoginOtpBusy(true);
    setLoginOtpMsg(null);
    try {
      const res = await fetch("/api/kiosk/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean, otp: loginOtp }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setLoginOtpMsg(data?.error ?? "Code invalide.");
        return;
      }

      const roleFromApi = String(data?.employee?.role ?? "EMPLOYEE").toUpperCase();
      const first = data?.employee?.firstName ?? "";
      const displayName = first.trim();

      // Keep same premium green success animation as regular PIN login.
      setPinError(false);
      setPinSuccess(true);
      setPinFlash(true);
      setTimeout(() => setPinFlash(false), 650);
      setTimeout(() => {
        setEmployeeLogged(true);
        setEmployeeCodeConfirmed(clean);
        setEmployeeName(displayName);
        saveEmployeeSession(clean, displayName, roleFromApi);
        setKioskRole(roleFromApi);
        setAwaitingOtpCode(null);
        setLoginOtp("");
        setLoginOtpMsg(null);
        router.replace("/kiosk");
      }, 650);
    } catch {
      setLoginOtpMsg("Erreur réseau.");
    } finally {
      setLoginOtpBusy(false);
    }
  }

  async function employeeLogout() {
    try {
      await fetch("/api/kiosk/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
    } catch {
      // ignore
    }

    localStorage.removeItem("kiosk_role");
    localStorage.removeItem("kiosk_employee_logged");
    localStorage.removeItem("kiosk_employee_code");
    localStorage.removeItem("kiosk_employee_name");

    setKioskRole(null);
    setEmployeeLogged(false);
    setEmployeeCodeConfirmed(null);
    setEmployeeName(null);
    setEmployeeCode("");
    setPinError(false);
    setPinSuccess(false);
    setPinFlash(false);
    setAutoSubmitting(false);
    setBlockedCode(null);
    setAwaitingOtpCode(null);
    setLoginOtp("");
    setLoginOtpMsg(null);

    await Promise.all([loadActifs(), loadPunchState()]);
    window.history.replaceState(null, "", "/kiosk");
    router.replace("/kiosk");
    router.refresh();
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

      if (role !== "ADMIN" && role !== "MANAGER") {
        throw new Error(`Accès refusé. Role=${role || "NONE"}`);
      }

      localStorage.setItem("kiosk_role", role);
      setKioskRole(role);

      clearEmployeeSession();
      setEmployeeLogged(false);
      setEmployeeCodeConfirmed(null);
      setEmployeeName(null);
      setEmployeeCode("");

      router.replace("/kiosk");
      setShowAdminModal(false);
    } catch (err: any) {
      setAdminError(err.message || "Erreur réseau.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function adminLogout() {
    try {
      await fetch("/api/kiosk/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
    } catch {
      // ignore
    }

    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    localStorage.removeItem("kiosk_role");
    localStorage.removeItem("kiosk_employee_logged");
    localStorage.removeItem("kiosk_employee_code");
    localStorage.removeItem("kiosk_employee_name");

    setKioskRole(null);
    setEmployeeLogged(false);
    setEmployeeCodeConfirmed(null);
    setEmployeeName(null);
    setEmployeeCode("");
    setPinError(false);
    setPinSuccess(false);
    setPinFlash(false);
    setAutoSubmitting(false);
    setBlockedCode(null);
    setAwaitingOtpCode(null);
    setLoginOtp("");
    setLoginOtpMsg(null);

    router.replace("/kiosk");
    router.refresh();
  }

  const state: PunchState = punchStatus?.state ?? "OUT";
  const displayedMs = getDisplayedMs(punchStatus, tickNow);
  const timerLabel =
    state === "ON_BREAK"
      ? "En pause"
      : state === "ON_LUNCH"
      ? "En repas"
      : state === "IN"
      ? "Temps travaillé"
      : "Temps";
  const timerDanger =
    (state === "ON_BREAK" && displayedMs > 15 * 60 * 1000) ||
    (state === "ON_LUNCH" && displayedMs > 30 * 60 * 1000);

  const buttons: {
    key: string;
    label: string;
    action: PunchAction;
    disabled: boolean;
    danger: boolean;
  }[] = [
    {
      key: "IN",
      label: "Entrée",
      action: "CLOCK_IN",
      disabled: state !== "OUT",
      danger: false,
    },
    {
      key: "BREAK",
      label: state === "ON_BREAK" ? "Retour" : "Pause",
      action: state === "ON_BREAK" ? "BREAK_END" : "BREAK_START",
      disabled:
        state === "OUT" ||
        state === "ON_LUNCH" ||
        (state === "IN" && Boolean(punchStatus?.breakDone)) ||
        (state !== "IN" && state !== "ON_BREAK"),
      danger: false,
    },
    {
      key: "LUNCH",
      label: state === "ON_LUNCH" ? "Retour" : "Repas",
      action: state === "ON_LUNCH" ? "LUNCH_END" : "LUNCH_START",
      disabled:
        state === "OUT" ||
        state === "ON_BREAK" ||
        (state === "IN" && Boolean(punchStatus?.lunchDone)) ||
        (state !== "IN" && state !== "ON_LUNCH"),
      danger: false,
    },
    {
      key: "OUT",
      label: "Sortie",
      action: "CLOCK_OUT",
      disabled: state !== "IN",
      danger: true,
    },
  ];

  return (
    <main className="kiosk-shell">
      <div className="kiosk-frame">
        <Suspense fallback={<div>Chargement du menu…</div>}>
          <KioskSidebar
            isPrivilegedLogged={isPrivilegedLogged}
            employeeLogged={employeeLogged}
            employeeCode={employeeCode}
          />
        </Suspense>

        <section className="kiosk-center">
          {!isAnyLogged ? (
            <h1 className="kiosk-title">Bienvenue</h1>
          ) : (
            <h1 className="kiosk-title kiosk-titleLogged">
              {isPrivilegedLogged
                ? `Bonjour ${firstWord(privilegedName) || privilegedCode || "Utilisateur"}`
                : `Salut ${firstWord(employeeName) || "Utilisateur"}`}
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
              <div className="pinBoxes" role="group" aria-label="Code">
                {maskedPinBoxes(employeeCode).map((ch, idx) => (
                  <div key={idx} className="pinBox">
                    <span className="pinStar">{ch ? "•" : ""}</span>
                  </div>
                ))}
              </div>
              <div className="pinHint">
                {pinError ? (
                  <span className="pinOops">Oops! Pin invalide</span>
                ) : otpSending ? (
                  <span className="pinLoading">
                    Envoi du code
                    <span className="loadingDots" aria-hidden>
                      <span>.</span><span>.</span><span>.</span>
                    </span>
                  </span>
                ) : (
                  <span>{"\u00A0"}</span>
                )}
              </div>
            </div>
          )}

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
                    setAwaitingOtpCode(null);
                    setLoginOtp("");
                    setLoginOtpMsg(null);
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

          {!isAnyLogged && awaitingOtpCode && (
            <div className="modal-overlay">
              <div className="modal-card">
                <h3 className="modal-title">Vérification email</h3>
                <p className="modal-sub">Entre le code reçu par email pour terminer la connexion.</p>
                <input
                  className="input"
                  inputMode="numeric"
                  value={loginOtp}
                  onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Code 6 chiffres"
                />
                {loginOtpMsg ? <div className="alert error" style={{ marginTop: 10 }}>{loginOtpMsg}</div> : null}
                <div className="otpActions">
                  <button className="primary" type="button" disabled={loginOtpBusy} onClick={verifyLoginOtp}>
                    {loginOtpBusy ? "..." : "Vérifier"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={loginOtpBusy || otpSending}
                    onClick={() => employeeConfirm(awaitingOtpCode)}
                  >
                    {otpSending ? "Envoi..." : "Renvoyer code"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(employeeLogged || isPrivilegedLogged) && (
            <div className="punchPanel">
              <div className="punchTitle">Punch</div>

              <div className={`punchTimer ${timerDanger ? "danger" : ""}`}>
                <div className="punchTimerLabel">{timerLabel}</div>
                <div className="punchTimerValue">{formatDuration(displayedMs)}</div>
              </div>

              {punchStateErr && <div className="punchError">{punchStateErr}</div>}

              <div className="punchBtns punchBtnsGrid">
                {buttons.map((btn) => (
                  <button
                    key={btn.key}
                    className={`punchBtn ${btn.danger ? "danger" : ""} ${btn.disabled ? "disabled" : ""}`}
                    type="button"
                    disabled={btn.disabled}
                    onClick={() => punch(btn.action)}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  className="kiosk-actionBtn"
                  type="button"
                  onClick={() => {
                    if (isPrivilegedLogged) {
                      adminLogout();
                    } else {
                      employeeLogout();
                    }
                  }}
                >
                  Déconnecter
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Mobile: button to open Actifs panel */}
        <button
          type="button"
          className="kiosk-actifs-fab"
          onClick={() => setActifsOverlayOpen(true)}
          aria-label="Voir les actifs"
        >
          <span className="kiosk-actifs-fab-icon" aria-hidden>👥</span>
          <span className="kiosk-actifs-fab-label">Actifs</span>
        </button>

        {/* Backdrop when Actifs overlay is open on mobile */}
        {actifsOverlayOpen && (
          <div
            className="kiosk-actifs-backdrop"
            onClick={() => setActifsOverlayOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Fermer"
            onKeyDown={(e) => e.key === "Escape" && setActifsOverlayOpen(false)}
          />
        )}

        <aside className={`kiosk-rightCol ${actifsOverlayOpen ? "kiosk-actifs-overlay-open" : ""}`}>
          <button
            type="button"
            className="kiosk-actifs-overlay-close"
            onClick={() => setActifsOverlayOpen(false)}
            aria-label="Fermer"
          >
            ✕
          </button>
          <div className="adminPanelHead kiosk-admin-desktop">
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

      {/* Mobile: Admin button fixed at bottom of page */}
      <div className="kiosk-admin-mobile-bar">
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

      {showAdminModal && !isPrivilegedLogged && (
        <div
          className="modal-overlay"
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

              <p className="modal-sub">Connexion admin (courriel + mot de passe).</p>

            <label className="label">Courriel</label>
            <input
              className="input"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              disabled={adminLoading}
            />

            <label className="label" style={{ marginTop: 10 }}>Mot de passe</label>
            <input
              className="input"
              value={adminPassword}
              type="password"
              onChange={(e) => setAdminPassword(e.target.value)}
              disabled={adminLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") adminLogin();
              }}
            />

            {adminError && <div className="alert">{adminError}</div>}

            <button
              className="primary"
              onClick={adminLogin}
              disabled={adminLoading || !adminEmail.trim() || adminPassword.length < 6}
            >
              Se connecter
            </button>

            <button
              className="secondary"
              onClick={() => setShowAdminModal(false)}
              disabled={adminLoading}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {overtimePrompt && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && dismissOvertimePrompt()}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Temps supplémentaire</h2>
              <button
                className="ghost"
                type="button"
                onClick={dismissOvertimePrompt}
                disabled={overtimePharmBusy}
              >
                ✕
              </button>
            </div>

            <p className="modal-sub">
              Temps supplémentaire détecté : <b>{fmtMinutes(overtimePrompt.overtimeMinutes)}</b>
            </p>

            {overtimePharmName ? (
              <>
                <div className="alert" style={{ background: "rgba(21,195,154,0.14)", borderColor: "rgba(21,195,154,0.25)" }}>
                  <span className="alert-dot" style={{ background: "rgba(21,195,154,0.92)" }} />
                  <p className="alert-text" style={{ margin: 0 }}>
                    Temps Supplementaire signer par: <b>{overtimePharmName}</b>
                  </p>
                </div>
                <button className="primary" type="button" onClick={dismissOvertimePrompt} style={{ marginTop: 12 }}>
                  OK
                </button>
              </>
            ) : (
              <>
                <label className="label">PIN pharmacien (4 chiffres)</label>
                <input
                  className="input"
                  value={overtimePharmPin}
                  inputMode="numeric"
                  onChange={(e) => setOvertimePharmPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LEN))}
                  placeholder="PIN"
                  disabled={overtimePharmBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") signOvertimeAsPharmacien();
                  }}
                />

                {overtimeError && (
                  <div className="alert" style={{ marginTop: 12, borderColor: "rgba(255,77,94,0.22)" }}>
                    <span className="alert-dot" />
                    <p className="alert-text" style={{ margin: 0 }}>{overtimeError}</p>
                  </div>
                )}

                <button
                  className="primary"
                  type="button"
                  onClick={signOvertimeAsPharmacien}
                  disabled={overtimePharmBusy}
                  style={{ marginTop: 12 }}
                >
                  {overtimePharmBusy ? "..." : "Signer pharmacien"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={dismissOvertimePrompt}
                  disabled={overtimePharmBusy}
                  style={{ marginTop: 10, width: "100%" }}
                >
                  Pas de Pharmacien signature
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="kiosk-toast">{toast}</div>}
    </main>
  );
}