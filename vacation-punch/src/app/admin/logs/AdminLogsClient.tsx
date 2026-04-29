"use client";

import { messageFromUnknown } from "@/lib/unknownError";
import { Fragment, useEffect, useMemo, useState } from "react";

type Department = "CASH" | "LAB" | "FLOOR";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  department: Department;
  punchKioskLocked?: boolean;
};

type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "LUNCH_START" | "LUNCH_END";
type PunchSource = "MOBILE" | "WEB" | "ADMIN";

type PunchEvent = {
  id: string;
  type: PunchType;
  at: string; // ISO
  source: PunchSource;
  employeeId: string;
};

type Shift = {
  id: string;
  employeeId: string;
  startTime: string; // ISO
  effectiveStartTime: string | null; // ISO
  endTime: string; // ISO
  note: string | null;
  status: string;
  lateMinutes: number | null;
  overtimeMinutes: number | null;
  lateStatus: "MISSING" | "OK" | "ACCEPTED" | "REJECTED" | "PENDING";
  overtimeStatus: "MISSING" | "OK" | "ACCEPTED" | "REJECTED" | "ACCEPTED_BY_PHARMACIST" | "PENDING";
  pharmacistEmployeeId: string | null;
  missingClockIn: boolean;
  missingClockOut: boolean;
  punches: PunchEvent[];
};

type ShiftChangeRequest = {
  id: string;
  status: string;
  decidedAt: string | null;
  message: string | null;
  shift: { id: string; startTime: string; endTime: string; note: string | null };
  requesterEmployee: { id: string; firstName: string; lastName: string; department: Department };
  candidateEmployee: { id: string; firstName: string; lastName: string; department: Department };
};

type AvailabilityRule = {
  employeeId: string;
  dayOfWeek: number; // 0=Sun
  available: boolean;
  startHHMM: string;
  endHHMM: string;
  note: string | null;
};

type TaskAssignment = {
  id: string;
  employeeId: string;
  date: string; // ISO
  title: string | null;
  notes: string | null;
  items: Array<{ id: string; text: string; required: boolean; done: boolean }>;
};

type AdminLogsResponse = {
  ok: true;
  from: string;
  to: string;
  employees: Employee[];
  availabilityRules: AvailabilityRule[];
  shifts: Shift[];
  shiftChangeRequests: ShiftChangeRequest[];
  taskAssignments: TaskAssignment[];
  meta: {
    shiftsCount: number;
    punchesCount: number;
    lateShiftsCount: number;
    overtimeShiftsCount: number;
  };
};

function ymdInLocal(d: Date) {
  // en-CA => YYYY-MM-DD in local time
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function clampToDayISO(iso: string) {
  // ymd from ISO in UTC-ish way
  return iso.slice(0, 10);
}

function minutesToHuman(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function punchTypeLabel(t: PunchType) {
  switch (t) {
    case "CLOCK_IN":
      return "Entrée";
    case "CLOCK_OUT":
      return "Sortie";
    case "BREAK_START":
      return "Début pause";
    case "BREAK_END":
      return "Fin pause";
    case "LUNCH_START":
      return "Début repas";
    case "LUNCH_END":
      return "Fin repas";
    default:
      return t;
  }
}

function punchSourceLabel(s: PunchSource) {
  switch (s) {
    case "MOBILE":
      return "Mobile";
    case "WEB":
      return "Web";
    case "ADMIN":
      return "Admin";
    default:
      return s;
  }
}

function shiftChangeStatusLabel(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "Accepté";
    case "REJECTED":
      return "Rejeté";
    case "CANCELLED":
      return "Annulé";
    case "PENDING":
      return "En attente";
    default:
      return status;
  }
}

export default function AdminLogsClient() {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return ymdInLocal(d);
  }, [today]);
  const defaultTo = useMemo(() => ymdInLocal(today), [today]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [tab, setTab] = useState<"punch" | "changes" | "tasks" | "availability">("punch");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminLogsResponse | null>(null);

  const selectedEmployee = useMemo(() => {
    if (!data?.employees?.length) return null;
    return data.employees.find((e) => e.id === selectedEmployeeId) ?? data.employees[0] ?? null;
  }, [data, selectedEmployeeId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setExpandedShiftId(null);
      try {
        const res = await fetch(`/api/admin/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as AdminLogsResponse | { error: string };

        if (cancelled) return;
        if (!res.ok || !json || !("ok" in json)) {
          const errBody = json as { error?: string } | null;
          setError(errBody?.error ?? "Erreur de chargement");
          setData(null);
          setLoading(false);
          return;
        }

        setData(json);
        setSelectedEmployeeId((prev) => prev ?? json.employees?.[0]?.id ?? null);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(messageFromUnknown(e) || "Erreur de chargement");
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const availabilityByEmployee = useMemo(() => {
    const map = new Map<string, AvailabilityRule[]>();
    if (!data?.availabilityRules) return map;
    for (const r of data.availabilityRules) {
      const arr = map.get(r.employeeId) ?? [];
      arr.push(r);
      map.set(r.employeeId, arr);
    }
    return map;
  }, [data]);

  const shiftsForSelected = useMemo(() => {
    if (!data || !selectedEmployee) return [];
    return data.shifts
      .filter((s) => s.employeeId === selectedEmployee.id)
      // Newest shift on top.
      .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
  }, [data, selectedEmployee]);

  const punchKpis = useMemo(() => {
    if (!data) return null;
    return {
      shifts: data.meta.shiftsCount,
      punches: data.meta.punchesCount,
      late: data.meta.lateShiftsCount,
      overtime: data.meta.overtimeShiftsCount,
    };
  }, [data]);

  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [manualOvertimeEndByShiftId, setManualOvertimeEndByShiftId] = useState<Record<string, string>>({});
  const [forceOutAtByShiftId, setForceOutAtByShiftId] = useState<Record<string, string>>({});
  const [punchAtDraftById, setPunchAtDraftById] = useState<Record<string, string>>({});
  const [punchCorrectionBusy, setPunchCorrectionBusy] = useState<string | null>(null);
  const [punchUnlockBusyId, setPunchUnlockBusyId] = useState<string | null>(null);

  function toDatetimeLocalValue(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  async function reloadLogs() {
    const res = await fetch(`/api/admin/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      cache: "no-store",
      credentials: "include",
    });
    const json = (await res.json().catch(() => null)) as AdminLogsResponse | { error: string };
    if ("ok" in json) setData(json as AdminLogsResponse);
  }

  async function reviewShift(
    shiftId: string,
    kind: "LATE" | "OVERTIME",
    decision: "ACCEPT" | "REJECT",
    manualEndHHMM?: string
  ) {
    if (reviewBusyId) return;
    setReviewBusyId(`${kind}:${decision}:${shiftId}`);
    try {
      await fetch(`/api/admin/logs/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, kind, decision, manualEndHHMM }),
        credentials: "include",
      });
      // fire and forget: just refresh to reflect any audit list later
      await reloadLogs();
    } catch {
      // ignore for now
    } finally {
      setReviewBusyId(null);
    }
  }

  async function forceClockOut(shiftId: string) {
    if (punchCorrectionBusy) return;
    setPunchCorrectionBusy(`force:${shiftId}`);
    try {
      const raw = forceOutAtByShiftId[shiftId]?.trim();
      const res = await fetch("/api/admin/logs/punch-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "FORCE_CLOCK_OUT",
          shiftId,
          ...(raw ? { atISO: new Date(raw).toISOString() } : {}),
        }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        window.alert(j?.error ?? "Impossible d’enregistrer la sortie.");
        return;
      }
      await reloadLogs();
    } finally {
      setPunchCorrectionBusy(null);
    }
  }

  async function unlockPunchKiosk(employeeId: string) {
    if (punchUnlockBusyId) return;
    setPunchUnlockBusyId(employeeId);
    try {
      const res = await fetch("/api/admin/punch-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        window.alert(j?.error ?? "Déverrouillage impossible.");
        return;
      }
      await reloadLogs();
    } finally {
      setPunchUnlockBusyId(null);
    }
  }

  async function updatePunchAt(punchEventId: string) {
    if (punchCorrectionBusy) return;
    const draft = punchAtDraftById[punchEventId]?.trim();
    if (!draft) return;
    setPunchCorrectionBusy(`upd:${punchEventId}`);
    try {
      const res = await fetch("/api/admin/logs/punch-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "UPDATE_PUNCH_AT",
          punchEventId,
          atISO: new Date(draft).toISOString(),
        }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        window.alert(j?.error ?? "Impossible de modifier l’heure.");
        return;
      }
      await reloadLogs();
    } finally {
      setPunchCorrectionBusy(null);
    }
  }

  useEffect(() => {
    if (!expandedShiftId || !data) return;
    const s = data.shifts.find((x) => x.id === expandedShiftId);
    if (!s?.missingClockOut) return;
    if (!s.punches.some((p) => p.type === "CLOCK_IN")) return;
    setForceOutAtByShiftId((prev) => {
      if (prev[expandedShiftId]) return prev;
      return { ...prev, [expandedShiftId]: toDatetimeLocalValue(new Date().toISOString()) };
    });
  }, [expandedShiftId, data]);

  function employeeNameById(id: string | null | undefined) {
    if (!id) return null;
    const e = data?.employees?.find((x) => x.id === id);
    if (!e) return id;
    return `${e.firstName} ${e.lastName}`.trim();
  }

  return (
    <main className="adminLogs">
      <header className="adminLogsHeader">
        <div>
          <h1 className="adminLogsTitle">Journal des pointages & vue planning</h1>
          <p className="adminLogsSub">Administration : pointages, retards, heures sup, disponibilités et changements.</p>
        </div>

        <div className="adminLogsControls">
          <div className="adminLogsDateRow">
            <label className="adminLogsLabel">
              De
              <input className="adminLogsInput" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="adminLogsLabel">
              À
              <input className="adminLogsInput" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>
      </header>

      <section className="adminLogsGrid">
        <aside className="adminLogsSide">
          <div className="adminLogsNavSection">
            <div className="adminLogsNavTitle">Catégories</div>
            <nav className="adminLogsNav" aria-label="Navigation journal">
              <button
                type="button"
                className={`adminLogsNavBtn ${tab === "punch" ? "on" : ""}`}
                aria-current={tab === "punch" ? "page" : undefined}
                onClick={() => {
                  setExpandedShiftId(null);
                  setTab("punch");
                }}
              >
                <span className="adminLogsNavDot dot-punch" aria-hidden="true" />
                Pointages
              </button>
              <button
                type="button"
                className={`adminLogsNavBtn ${tab === "availability" ? "on" : ""}`}
                aria-current={tab === "availability" ? "page" : undefined}
                onClick={() => {
                  setExpandedShiftId(null);
                  setTab("availability");
                }}
              >
                <span className="adminLogsNavDot dot-availability" aria-hidden="true" />
                Disponibilités
              </button>
              <button
                type="button"
                className={`adminLogsNavBtn ${tab === "changes" ? "on" : ""}`}
                aria-current={tab === "changes" ? "page" : undefined}
                onClick={() => {
                  setExpandedShiftId(null);
                  setTab("changes");
                }}
              >
                <span className="adminLogsNavDot dot-changes" aria-hidden="true" />
                Changement
              </button>
              <button
                type="button"
                className={`adminLogsNavBtn ${tab === "tasks" ? "on" : ""}`}
                aria-current={tab === "tasks" ? "page" : undefined}
                onClick={() => {
                  setExpandedShiftId(null);
                  setTab("tasks");
                }}
              >
                <span className="adminLogsNavDot dot-tasks" aria-hidden="true" />
                Tâches
              </button>
            </nav>
          </div>

          <div className="adminLogsSideHead">
            <div className="adminLogsSideTitle">Employés</div>
          </div>

          <div className="adminLogsEmployeeList" role="list">
            {(data?.employees ?? []).map((e) => {
              const sCount = data?.shifts?.filter((s) => s.employeeId === e.id).length ?? 0;
              const lateCount = data?.shifts?.filter((s) => s.employeeId === e.id && s.lateStatus === "PENDING").length ?? 0;
              const otCount = data?.shifts?.filter((s) => s.employeeId === e.id && s.overtimeStatus === "PENDING").length ?? 0;
              const isSelected = selectedEmployee?.id === e.id;

              return (
                <div
                  key={e.id}
                  className={`adminLogsEmployee ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedEmployeeId(e.id)}
                  role="listitem"
                  tabIndex={0}
                >
                  <div className="adminLogsEmployeeTop">
                    <div className="adminLogsEmployeeName">
                      {e.firstName} {e.lastName}
                    </div>
                    <span className={`adminLogsDept dept-${e.department}`}>{e.department}</span>
                  </div>

                  <div className="adminLogsEmployeeStats">
                    <span className="stat">{sCount} quarts</span>
                    <span className={`badge ${lateCount ? "warn" : ""}`}>{lateCount} retards</span>
                    <span className={`badge ${otCount ? "ok" : ""}`}>{otCount} heures sup</span>
                    {e.punchKioskLocked ? (
                      <span
                        className="badge punchLockBadge"
                        title="Kiosque verrouillé après sortie (jusqu’au lendemain ou déverrouillage manuel)"
                      >
                        Kiosque verr.
                      </span>
                    ) : null}
                  </div>
                  {e.punchKioskLocked ? (
                    <button
                      type="button"
                      className="adminLogsUnlockInlineBtn"
                      disabled={punchUnlockBusyId === e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void unlockPunchKiosk(e.id);
                      }}
                    >
                      {punchUnlockBusyId === e.id ? "…" : "Déverrouiller pointage"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="adminLogsMain">
          {loading ? (
            <div className="adminLogsEmpty">Chargement…</div>
          ) : error ? (
            <div className="adminLogsEmpty adminLogsError">{error}</div>
          ) : !data ? (
            <div className="adminLogsEmpty">Aucune donnée.</div>
          ) : (
            <>
              {tab === "punch" && (
                <div className="adminLogsPanel">
                  <div className="adminLogsKpis">
                    <div className="kpi">
                      Quarts : <b>{punchKpis?.shifts ?? 0}</b>
                    </div>
                    <div className="kpi">
                      Pointages : <b>{punchKpis?.punches ?? 0}</b>
                    </div>
                    <div className="kpi warn">
                      Retards : <b>{punchKpis?.late ?? 0}</b>
                    </div>
                    <div className="kpi ok">
                      Heures sup : <b>{punchKpis?.overtime ?? 0}</b>
                    </div>
                  </div>

                  <div className="adminLogsDetailsHead">
                    <div className="adminLogsDetailsTitle">
                      {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : "—"}
                    </div>
                    <div className="adminLogsDetailsSub">Cliquez un quart pour ouvrir le détail des pointages.</div>
                  </div>

                  {selectedEmployee?.punchKioskLocked ? (
                    <div className="adminLogsPunchLockBar">
                      <span className="adminLogsPunchLockText">
                        Pointage kiosque verrouillé (sortie enregistrée) jusqu’au lendemain. Déverrouiller pour un 2e quart le même jour ou cas exceptionnel.
                      </span>
                      <button
                        type="button"
                        className="btnSmall okBtn adminLogsUnlockPunchBtn"
                        disabled={punchUnlockBusyId === selectedEmployee.id}
                        onClick={() => void unlockPunchKiosk(selectedEmployee.id)}
                      >
                        {punchUnlockBusyId === selectedEmployee.id ? "…" : "Déverrouiller le pointage"}
                      </button>
                    </div>
                  ) : null}

                  <div className="adminLogsTableWrap adminLogsDesktopOnly">
                    <table className="adminLogsTable">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Heures</th>
                          <th>Retard</th>
                          <th>Heures sup</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftsForSelected.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="muted">
                              Aucun shift trouvé sur cette période.
                            </td>
                          </tr>
                        ) : (
                          shiftsForSelected.map((s) => {
                            const isOpen = expandedShiftId === s.id;
                            const date = clampToDayISO(s.startTime);

                            return (
                              <Fragment key={s.id}>
                                <tr
                                  className={`adminLogsRow ${isOpen ? "open" : ""}`}
                                  onClick={() => setExpandedShiftId(isOpen ? null : s.id)}
                                >
                                  <td>{date}</td>
                                  <td>
                                    {new Date(s.effectiveStartTime ?? s.startTime).toLocaleTimeString("fr-CA", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    })} → {new Date(s.endTime).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                  </td>
                                  <td>
                                    {s.missingClockIn ? (
                                      <span className="tag danger">Entrée manquante</span>
                                    ) : s.lateMinutes && s.lateMinutes > 0 ? (
                                      s.lateStatus === "ACCEPTED" ? (
                                        <span className="tag ok">{minutesToHuman(s.lateMinutes)}</span>
                                      ) : s.lateStatus === "REJECTED" ? (
                                        <span className="tag danger">Rejeté</span>
                                      ) : (
                                        <span className="tag warn">{minutesToHuman(s.lateMinutes)}</span>
                                      )
                                    ) : (
                                      <span className="tag ok">OK</span>
                                    )}
                                    {s.note?.toUpperCase().includes("PUNCH_AUTO_UNAVAILABLE") ? (
                                      <div className="muted" style={{ marginTop: 8, fontWeight: 900, fontSize: 12 }}>
                                        Hors disponibilité
                                      </div>
                                    ) : s.note?.toUpperCase().includes("PUNCH_AUTO") ? (
                                      <div className="muted" style={{ marginTop: 8, fontWeight: 900, fontSize: 12 }}>
                                        Quart auto-créé (punch hors horaire)
                                      </div>
                                    ) : null}
                                  </td>
                                  <td>
                                    {s.missingClockOut ? (
                                      <span className="tag danger">Sortie manquante</span>
                                    ) : s.overtimeMinutes && s.overtimeMinutes > 0 ? (
                                      s.overtimeStatus === "ACCEPTED" ? (
                                        <span className="tag ok">{minutesToHuman(s.overtimeMinutes)}</span>
                                      ) : s.overtimeStatus === "ACCEPTED_BY_PHARMACIST" ? (
                                        <span className="tag ok">{minutesToHuman(s.overtimeMinutes)} (pharmacien)</span>
                                      ) : s.overtimeStatus === "REJECTED" ? (
                                        <span className="tag danger">Rejeté</span>
                                      ) : (
                                        <span className="tag warn">{minutesToHuman(s.overtimeMinutes)}</span>
                                      )
                                    ) : (
                                      <span className="tag">—</span>
                                    )}
                                  </td>
                                  <td className="right">
                                    <span className="link">{isOpen ? "Masquer" : "Détails"} →</span>
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr className="adminLogsExpand">
                                    <td colSpan={5}>
                                      <div className="expandGrid">
                                        <div>
                                          <div className="expandTitle">Événements de pointage</div>
                                          {s.missingClockOut && s.punches.some((p) => p.type === "CLOCK_IN") ? (
                                            <div className="adminForceOutBox" onClick={(ev) => ev.stopPropagation()}>
                                              <div className="adminForceOutTitle">Sortie oubliée</div>
                                              <p className="adminForceOutHint">
                                                Enregistrer une sortie manuelle (correction patron). Laissez l’heure par défaut ou ajustez.
                                              </p>
                                              <div className="adminForceOutRow">
                                                <input
                                                  className="manualOvertimeInput adminPunchDatetime"
                                                  type="datetime-local"
                                                  value={forceOutAtByShiftId[s.id] ?? toDatetimeLocalValue(new Date().toISOString())}
                                                  onChange={(e) =>
                                                    setForceOutAtByShiftId((prev) => ({ ...prev, [s.id]: e.target.value }))
                                                  }
                                                />
                                                <button
                                                  type="button"
                                                  className="btnSmall okBtn"
                                                  disabled={punchCorrectionBusy === `force:${s.id}`}
                                                  onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    void forceClockOut(s.id);
                                                  }}
                                                >
                                                  {punchCorrectionBusy === `force:${s.id}` ? "…" : "Pointer la sortie"}
                                                </button>
                                              </div>
                                            </div>
                                          ) : null}
                                          <div className="expandList">
                                            {s.punches.length === 0 ? (
                                              <div className="muted">Aucun punch lié au shift.</div>
                                            ) : (
                                              // Newest punch on top.
                                              [...s.punches]
                                                .reverse()
                                                .map((p) => {
                                                  const canEditTime = p.type === "CLOCK_IN" || p.type === "CLOCK_OUT";
                                                  return (
                                                    <div key={p.id} className="punchItem punchItemEditable">
                                                      <div className="punchItemTop">
                                                        <span className={`punchType type-${p.type}`}>
                                                          {punchTypeLabel(p.type)}
                                                        </span>
                                                        <span className="punchSrc">{punchSourceLabel(p.source)}</span>
                                                      </div>
                                                      {canEditTime ? (
                                                        <div className="punchEditRow" onClick={(ev) => ev.stopPropagation()}>
                                                          <input
                                                            className="manualOvertimeInput adminPunchDatetime"
                                                            type="datetime-local"
                                                            value={
                                                              punchAtDraftById[p.id] ?? toDatetimeLocalValue(p.at)
                                                            }
                                                            onChange={(e) =>
                                                              setPunchAtDraftById((prev) => ({
                                                                ...prev,
                                                                [p.id]: e.target.value,
                                                              }))
                                                            }
                                                          />
                                                          <button
                                                            type="button"
                                                            className="btnSmall secondaryBtn"
                                                            disabled={punchCorrectionBusy === `upd:${p.id}`}
                                                            onClick={(ev) => {
                                                              ev.stopPropagation();
                                                              void updatePunchAt(p.id);
                                                            }}
                                                          >
                                                            {punchCorrectionBusy === `upd:${p.id}` ? "…" : "Appliquer"}
                                                          </button>
                                                        </div>
                                                      ) : (
                                                        <span className="punchAt">
                                                          {new Date(p.at).toLocaleTimeString("fr-CA", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            hour12: false,
                                                          })}
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })
                                            )}
                                          </div>
                                        </div>

                                        <div>
                                          <div className="expandTitle">Actions</div>
                                          <div className="expandActions">
                                            {s.overtimeStatus === "PENDING" ? (
                                              <>
                                                <div className="manualOvertimeRow">
                                                  <label className="manualOvertimeLabel">Fin manuelle</label>
                                                  <input
                                                    className="manualOvertimeInput"
                                                    type="time"
                                                    value={
                                                      manualOvertimeEndByShiftId[s.id] ??
                                                      new Date(s.endTime).toLocaleTimeString("fr-CA", {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        hour12: false,
                                                      })
                                                    }
                                                    onChange={(e) =>
                                                      setManualOvertimeEndByShiftId((prev) => ({
                                                        ...prev,
                                                        [s.id]: e.target.value,
                                                      }))
                                                    }
                                                  />
                                                </div>
                                                <button
                                                  type="button"
                                                  className="btnSmall okBtn"
                                                  disabled={
                                                    s.overtimeStatus !== "PENDING" ||
                                                    reviewBusyId === `OVERTIME:ACCEPT:${s.id}`
                                                  }
                                                  onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    reviewShift(
                                                      s.id,
                                                      "OVERTIME",
                                                      "ACCEPT",
                                                      manualOvertimeEndByShiftId[s.id] ??
                                                        new Date(s.endTime).toLocaleTimeString("fr-CA", {
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                          hour12: false,
                                                        })
                                                    );
                                                  }}
                                                >
                                                  Heures sup vérifiées
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btnSmall dangerBtn"
                                                  disabled={
                                                    s.overtimeStatus !== "PENDING" ||
                                                    reviewBusyId === `OVERTIME:REJECT:${s.id}`
                                                  }
                                                  onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    reviewShift(s.id, "OVERTIME", "REJECT");
                                                  }}
                                                >
                                                  Heures sup rejetées
                                                </button>
                                              </>
                                            ) : null}
                                          </div>
                                          {s.overtimeStatus === "ACCEPTED_BY_PHARMACIST" ? (
                                            <div className="muted" style={{ marginTop: 10 }}>
                                              Temps Supplementaire signer par:{" "}
                                              {employeeNameById(s.pharmacistEmployeeId) ?? "—"}
                                            </div>
                                          ) : (
                                            <div className="muted" style={{ marginTop: 10 }}>
                                              Retard / heures sup calculés pour ce quart.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="adminLogsMobileOnly adminLogsMobileCards">
                    {shiftsForSelected.length === 0 ? (
                      <div className="adminLogsEmpty">Aucun shift trouvé sur cette période.</div>
                    ) : (
                      shiftsForSelected.map((s) => {
                        const isOpen = expandedShiftId === s.id;
                        const date = clampToDayISO(s.startTime);
                        return (
                          <div key={s.id} className={`adminLogsShiftCard ${isOpen ? "open" : ""}`}>
                            <button
                              type="button"
                              className="adminLogsShiftCardHead"
                              onClick={() => setExpandedShiftId(isOpen ? null : s.id)}
                            >
                              <div>
                                <div className="adminLogsShiftDate">{date}</div>
                                <div className="adminLogsShiftTime">
                                  {new Date(s.effectiveStartTime ?? s.startTime).toLocaleTimeString("fr-CA", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })}{" "}
                                  →{" "}
                                  {new Date(s.endTime).toLocaleTimeString("fr-CA", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })}
                                </div>
                              </div>
                              <span className="link">{isOpen ? "Masquer" : "Détails"} →</span>
                            </button>

                            <div className="adminLogsShiftBadges">
                              {s.missingClockIn ? (
                                <span className="tag danger">Entrée manquante</span>
                              ) : s.lateMinutes && s.lateMinutes > 0 ? (
                                s.lateStatus === "ACCEPTED" ? (
                                  <span className="tag ok">{minutesToHuman(s.lateMinutes)}</span>
                                ) : s.lateStatus === "REJECTED" ? (
                                  <span className="tag danger">Retard rejeté</span>
                                ) : (
                                  <span className="tag warn">{minutesToHuman(s.lateMinutes)}</span>
                                )
                              ) : (
                                <span className="tag ok">Retard: OK</span>
                              )}

                              {s.missingClockOut ? (
                                <span className="tag danger">Sortie manquante</span>
                              ) : s.overtimeMinutes && s.overtimeMinutes > 0 ? (
                                s.overtimeStatus === "ACCEPTED" ? (
                                  <span className="tag ok">Sup: {minutesToHuman(s.overtimeMinutes)}</span>
                                ) : s.overtimeStatus === "ACCEPTED_BY_PHARMACIST" ? (
                                  <span className="tag ok">Sup signée pharmacien</span>
                                ) : s.overtimeStatus === "REJECTED" ? (
                                  <span className="tag danger">Sup rejetée</span>
                                ) : (
                                  <span className="tag warn">Sup: {minutesToHuman(s.overtimeMinutes)}</span>
                                )
                              ) : (
                                <span className="tag">Sup: —</span>
                              )}
                            </div>

                            {isOpen && (
                              <div className="adminLogsShiftExpand">
                                <div className="expandGrid">
                                  <div>
                                    <div className="expandTitle">Événements de pointage</div>
                                    {s.missingClockOut && s.punches.some((p) => p.type === "CLOCK_IN") ? (
                                      <div className="adminForceOutBox">
                                        <div className="adminForceOutTitle">Sortie oubliée</div>
                                        <p className="adminForceOutHint">
                                          Enregistrer une sortie manuelle (correction patron). Laissez l’heure par défaut ou ajustez.
                                        </p>
                                        <div className="adminForceOutRow">
                                          <input
                                            className="manualOvertimeInput adminPunchDatetime"
                                            type="datetime-local"
                                            value={forceOutAtByShiftId[s.id] ?? toDatetimeLocalValue(new Date().toISOString())}
                                            onChange={(e) =>
                                              setForceOutAtByShiftId((prev) => ({ ...prev, [s.id]: e.target.value }))
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="btnSmall okBtn"
                                            disabled={punchCorrectionBusy === `force:${s.id}`}
                                            onClick={() => void forceClockOut(s.id)}
                                          >
                                            {punchCorrectionBusy === `force:${s.id}` ? "…" : "Pointer la sortie"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    <div className="expandList">
                                      {s.punches.length === 0 ? (
                                        <div className="muted">Aucun punch lié au shift.</div>
                                      ) : (
                                        [...s.punches].reverse().map((p) => {
                                          const canEditTime = p.type === "CLOCK_IN" || p.type === "CLOCK_OUT";
                                          return (
                                            <div key={p.id} className="punchItem punchItemEditable">
                                              <div className="punchItemTop">
                                                <span className={`punchType type-${p.type}`}>{punchTypeLabel(p.type)}</span>
                                                <span className="punchSrc">{punchSourceLabel(p.source)}</span>
                                              </div>
                                              {canEditTime ? (
                                                <div className="punchEditRow">
                                                  <input
                                                    className="manualOvertimeInput adminPunchDatetime"
                                                    type="datetime-local"
                                                    value={punchAtDraftById[p.id] ?? toDatetimeLocalValue(p.at)}
                                                    onChange={(e) =>
                                                      setPunchAtDraftById((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                    }
                                                  />
                                                  <button
                                                    type="button"
                                                    className="btnSmall secondaryBtn"
                                                    disabled={punchCorrectionBusy === `upd:${p.id}`}
                                                    onClick={() => void updatePunchAt(p.id)}
                                                  >
                                                    {punchCorrectionBusy === `upd:${p.id}` ? "…" : "Appliquer"}
                                                  </button>
                                                </div>
                                              ) : (
                                                <span className="punchAt">
                                                  {new Date(p.at).toLocaleTimeString("fr-CA", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: false,
                                                  })}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="expandTitle">Actions</div>
                                    <div className="expandActions">
                                      {s.overtimeStatus === "PENDING" ? (
                                        <>
                                          <div className="manualOvertimeRow">
                                            <label className="manualOvertimeLabel">Fin manuelle</label>
                                            <input
                                              className="manualOvertimeInput"
                                              type="time"
                                              value={
                                                manualOvertimeEndByShiftId[s.id] ??
                                                new Date(s.endTime).toLocaleTimeString("fr-CA", {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                  hour12: false,
                                                })
                                              }
                                              onChange={(e) =>
                                                setManualOvertimeEndByShiftId((prev) => ({ ...prev, [s.id]: e.target.value }))
                                              }
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            className="btnSmall okBtn"
                                            disabled={
                                              s.overtimeStatus !== "PENDING" || reviewBusyId === `OVERTIME:ACCEPT:${s.id}`
                                            }
                                            onClick={() =>
                                              reviewShift(
                                                s.id,
                                                "OVERTIME",
                                                "ACCEPT",
                                                manualOvertimeEndByShiftId[s.id] ??
                                                  new Date(s.endTime).toLocaleTimeString("fr-CA", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: false,
                                                  })
                                              )
                                            }
                                          >
                                            Heures sup vérifiées
                                          </button>
                                          <button
                                            type="button"
                                            className="btnSmall dangerBtn"
                                            disabled={
                                              s.overtimeStatus !== "PENDING" || reviewBusyId === `OVERTIME:REJECT:${s.id}`
                                            }
                                            onClick={() => reviewShift(s.id, "OVERTIME", "REJECT")}
                                          >
                                            Heures sup rejetées
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {tab === "availability" && (
                <div className="adminLogsPanel">
                  <div className="adminLogsDetailsHead">
                    <div className="adminLogsDetailsTitle">Disponibilités</div>
                    <div className="adminLogsDetailsSub">Sélectionnez un employé pour voir ses règles.</div>
                  </div>

                  <div className="adminLogsAvailabilityGrid">
                    {(selectedEmployee ? [selectedEmployee] : []).map((e) => {
                      const rules = availabilityByEmployee.get(e.id) ?? [];
                      const globalNote =
                        rules.find((r) => (r.note ?? "").trim().length > 0)?.note ?? "";
                      return (
                        <div key={e.id} className="availabilityCard">
                          <div className="availabilityCardTop">
                            <div className="availabilityName">{e.firstName} {e.lastName}</div>
                            <span className={`deptPill dept-${e.department}`}>{e.department}</span>
                          </div>
                          <div className="availabilityDays">
                            {DAY_LABELS.map((label, day) => {
                              const r = rules.find((x) => x.dayOfWeek === day);
                              const available = r?.available;
                              return (
                                <div key={day} className={`dayCell ${available ? "yes" : "no"}`}>
                                  <div className="dayLabel">{label}</div>
                                  <div className="dayValue">
                                    {available ? `${r?.startHHMM}–${r?.endHHMM}` : "Indisponible"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {globalNote ? <div className="availabilityGlobalNote">Note: {globalNote}</div> : null}
                        </div>
                      );
                    })}

                    {!selectedEmployee && <div className="adminLogsEmpty">Sélectionnez un employé.</div>}
                  </div>
                </div>
              )}

              {tab === "changes" && (
                <div className="adminLogsPanel">
                  <div className="adminLogsDetailsHead">
                    <div className="adminLogsDetailsTitle">Changements (Quart)</div>
                    <div className="adminLogsDetailsSub">Acceptés / rejetés / annulés sur la période.</div>
                  </div>

                  <div className="adminLogsTableWrap adminLogsDesktopOnly">
                    <table className="adminLogsTable">
                      <thead>
                        <tr>
                          <th>Décision</th>
                          <th>Demandeur</th>
                          <th>Candidat</th>
                          <th>Shift</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.shiftChangeRequests.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="muted">Aucun changement sur cette période.</td>
                          </tr>
                        ) : (
                          data.shiftChangeRequests.map((r) => (
                            <tr key={r.id}>
                              <td>{r.decidedAt ? clampToDayISO(r.decidedAt) : "—"}</td>
                              <td>{r.requesterEmployee.firstName} {r.requesterEmployee.lastName}</td>
                              <td>{r.candidateEmployee.firstName} {r.candidateEmployee.lastName}</td>
                              <td>
                                <div className="muted">{clampToDayISO(r.shift.startTime)}</div>
                                <div>
                                  {new Date(r.shift.startTime).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}→
                                  {" "}
                                  {new Date(r.shift.endTime).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                </div>
                              </td>
                              <td>
                                <span className={`tag ${r.status === "ACCEPTED" ? "ok" : r.status === "REJECTED" ? "danger" : "muted"}`}>
                                  {shiftChangeStatusLabel(r.status)}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="adminLogsMobileOnly adminLogsMobileCards">
                    {data.shiftChangeRequests.length === 0 ? (
                      <div className="adminLogsEmpty">Aucun changement sur cette période.</div>
                    ) : (
                      data.shiftChangeRequests.map((r) => (
                        <div key={r.id} className="adminLogsChangeCard">
                          <div className="adminLogsChangeTop">
                            <span className={`tag ${r.status === "ACCEPTED" ? "ok" : r.status === "REJECTED" ? "danger" : "warn"}`}>
                              {shiftChangeStatusLabel(r.status)}
                            </span>
                            <span className="muted">{r.decidedAt ? clampToDayISO(r.decidedAt) : "—"}</span>
                          </div>
                          <div className="adminLogsChangeLine">
                            <b>Demandeur:</b> {r.requesterEmployee.firstName} {r.requesterEmployee.lastName}
                          </div>
                          <div className="adminLogsChangeLine">
                            <b>Candidat:</b> {r.candidateEmployee.firstName} {r.candidateEmployee.lastName}
                          </div>
                          <div className="adminLogsChangeLine">
                            <b>Quart:</b> {clampToDayISO(r.shift.startTime)}{" "}
                            {new Date(r.shift.startTime).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                            {" → "}
                            {new Date(r.shift.endTime).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === "tasks" && (
                <div className="adminLogsPanel">
                  <div className="adminLogsDetailsHead">
                    <div className="adminLogsDetailsTitle">Tâches</div>
                    <div className="adminLogsDetailsSub">Affectations (titre + items) sur la période.</div>
                  </div>

                  <div className="adminLogsTasks">
                    {(data.taskAssignments ?? [])
                      .filter((a) => (selectedEmployee ? a.employeeId === selectedEmployee.id : true))
                      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                      .map((a) => (
                        <div key={a.id} className="taskCard">
                          <div className="taskTop">
                            <div className="taskTitle">{a.title ?? "Tâches"}</div>
                            <div className="taskDate">{clampToDayISO(a.date)}</div>
                          </div>
                          {a.notes ? <div className="taskNotes">{a.notes}</div> : null}
                          <div className="taskItems">
                            {a.items.slice(0, 8).map((it) => (
                              <div key={it.id} className="taskItem">
                                <span className={`taskCheck ${it.done ? "done" : ""}`}>{it.done ? "✓" : "•"}</span>
                                <span className="taskText">{it.text}</span>
                                <span className="taskReq">{it.required ? "(Oblig.)" : "(Optionnel)"}</span>
                              </div>
                            ))}
                            {a.items.length > 8 ? <div className="muted">+{a.items.length - 8} items…</div> : null}
                          </div>
                        </div>
                      ))}

                    {(data.taskAssignments ?? []).filter((a) => (selectedEmployee ? a.employeeId === selectedEmployee.id : true)).length === 0 ? (
                      <div className="adminLogsEmpty">Aucune tâche assignée pour cet employé sur la période.</div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

    </main>
  );
}

