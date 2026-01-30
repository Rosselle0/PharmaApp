"use client";
import "../schedule.css";
import "./edit.css";
import Link from "next/link";
import { useMemo, useState } from "react";

type Department = "FLOOR" | "CASH_LAB";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: Department;
};

type Shift = {
  id: string;
  employeeId: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  note: string | null;
};

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ✅ IMPORTANT FIX: use en-CA so we always get "08:00" (not "08 h 00")
function hm(d: Date) {
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function clampToBusinessHours(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;

  let h = Number(m[1]);
  let min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59) return null;

  // business range 8..21 (end can be 21:00)
  if (h < 8) h = 8;
  if (h > 21) h = 21;

  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function makeLocalDateTime(dayISO: string, hhmm: string) {
  const d = new Date(dayISO);
  const [hh, mm] = hhmm.split(":").map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export default function ScheduleEditorClient(props: {
  weekStartISO: string;
  daysISO: string[];
  employees: Employee[];
  shifts: Shift[];
}) {
  const weekStart = new Date(props.weekStartISO);
  const days = props.daysISO.map((x) => new Date(x));

  const [shifts, setShifts] = useState<Shift[]>(props.shifts);

  // modal state
  const [open, setOpen] = useState(false);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [activeDayISO, setActiveDayISO] = useState<string | null>(null);
  const [startHHMM, setStartHHMM] = useState("08:00");
  const [endHHMM, setEndHHMM] = useState("17:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const byEmpDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.employeeId}:${ymdLocal(new Date(s.startTime))}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [shifts]);

  const hoursFmt = useMemo(
    () => new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    []
  );

  function calcTotalHours(employeeId: string) {
    let mins = 0;
    for (const s of shifts) {
      if (s.employeeId !== employeeId) continue;
      const a = new Date(s.startTime).getTime();
      const b = new Date(s.endTime).getTime();
      mins += Math.max(0, Math.floor((b - a) / 60000));
    }
    return mins / 60;
  }

  function openCell(empId: string, day: Date) {
    setMsg(null);
    setActiveEmployeeId(empId);
    setActiveDayISO(day.toISOString());

    const key = `${empId}:${ymdLocal(day)}`;
    const list = byEmpDay.get(key) ?? [];

    if (list[0]) {
      const s = list[0];
      setStartHHMM(hm(new Date(s.startTime)));
      setEndHHMM(hm(new Date(s.endTime)));
      setNote(s.note ?? "");
    } else {
      setStartHHMM("08:00");
      setEndHHMM("17:00");
      setNote("");
    }

    setOpen(true);
  }

  async function saveShift() {
    if (!activeEmployeeId || !activeDayISO) return;

    const st = clampToBusinessHours(startHHMM);
    const en = clampToBusinessHours(endHHMM);

    if (!st || !en) {
      setMsg("Heure invalide. Format: HH:MM (08:00–21:00)");
      return;
    }

    // ✅ restore the real Date objects (you lost these in your broken paste)
    const start = makeLocalDateTime(activeDayISO, st);
    const end = makeLocalDateTime(activeDayISO, en);

    if (end.getTime() <= start.getTime()) {
      setMsg("Fin doit être après début.");
      return;
    }

    // enforce business window precisely
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    if (startHour < 8 || endHour > 21) {
      setMsg("Plage autorisée: 08:00 à 21:00.");
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch("/api/schedule/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: activeEmployeeId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          note: note.trim() || null,
        }),
      });

      // ✅ clean error message (no JSON blob in the input)
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Erreur");

      const saved: Shift = data.shift;

      const keyDay = ymdLocal(new Date(activeDayISO));
      setShifts((prev) => {
        const filtered = prev.filter(
          (s) =>
            !(
              s.employeeId === activeEmployeeId &&
              ymdLocal(new Date(s.startTime)) === keyDay
            )
        );
        return [...filtered, saved].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      });

      setOpen(false);
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function clearShift() {
    if (!activeEmployeeId || !activeDayISO) return;
    const keyDay = ymdLocal(new Date(activeDayISO));

    const existing = shifts.find(
      (s) => s.employeeId === activeEmployeeId && ymdLocal(new Date(s.startTime)) === keyDay
    );
    if (!existing) {
      setOpen(false);
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/schedule/shifts/${existing.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      setShifts((prev) => prev.filter((s) => s.id !== existing.id));
      setOpen(false);
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const prevWeek = ymdLocal(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = ymdLocal(new Date(weekStart.getTime() + 7 * 86400000));

  return (
    <main className="page">
      <div className="shell">
        <div className="head">
          <div>
            <h1 className="h1">Création Horaire</h1>
            <p className="p">Clique une case vide → ajoute une plage (08:00–21:00). Total se calcule tout seul.</p>
          </div>

          <div className="row">
            <Link className="btn" href={`/schedule/edit?week=${encodeURIComponent(prevWeek)}`}>← Semaine précédente</Link>
            <Link className="btn" href={`/schedule/edit?week=${encodeURIComponent(nextWeek)}`}>Semaine suivante →</Link>
            <Link className="btn" href="/kiosk">Retour</Link>
          </div>
        </div>

        <div className="card">
          <div className="cardTop">
            <div className="title">Semaine du {weekStart.toLocaleDateString("fr-CA")}</div>
            <div className="sub">Admin editor</div>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th sticky">Employé</th>
                  {days.map((d, i) => (
                    <th key={ymdLocal(d)} className="th">
                      {DAY_LABELS[i]} <br />
                      <span className="muted">{d.toLocaleDateString("fr-CA")}</span>
                    </th>
                  ))}
                  <th className="th">Total</th>
                </tr>
              </thead>

              <tbody>
                {props.employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="td sticky">
                      <div className="name">{emp.firstName} {emp.lastName}</div>
                      <div className="muted">{emp.department === "CASH_LAB" ? "Caisse / Lab" : "Plancher"}</div>
                    </td>

                    {days.map((d) => {
                      const key = `${emp.id}:${ymdLocal(d)}`;
                      const list = byEmpDay.get(key) ?? [];

                      return (
                        <td
                          key={key}
                          className={`td cell ${list.length ? "filled" : "empty"}`}
                          onClick={() => openCell(emp.id, d)}
                          role="button"
                          tabIndex={0}
                        >
                          {list.length === 0 ? (
                            <span className="muted">+</span>
                          ) : (
                            list.map((s) => (
                              <div key={s.id} className="pill">
                                <span>{hm(new Date(s.startTime))}</span>
                                <span>–</span>
                                <span>{hm(new Date(s.endTime))}</span>
                                {s.note ? <span className="dot">•</span> : null}
                              </div>
                            ))
                          )}
                        </td>
                      );
                    })}

                    <td className="td total">
                      <b>{hoursFmt.format(calcTotalHours(emp.id))} h</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {open ? (
        <div className="modalBack" onMouseDown={() => !saving && setOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">Ajouter / Modifier</div>
                <div className="mutedSmall">Plage: 08:00–21:00</div>
              </div>
              <button className="x" onClick={() => !saving && setOpen(false)}>✕</button>
            </div>

            <div className="form">
              <div className="grid2">
                <div className="field">
                  <label>Début</label>
                  <input value={startHHMM} onChange={(e) => setStartHHMM(e.target.value)} placeholder="08:00" />
                  <div className="quick">
                    {Array.from({ length: 14 }, (_, i) => i + 8).map((h) => (
                      <button
                        key={h}
                        className="chip"
                        type="button"
                        onClick={() => setStartHHMM(`${String(h).padStart(2, "0")}:00`)}
                      >
                        {String(h).padStart(2, "0")}:00
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Fin</label>
                  <input value={endHHMM} onChange={(e) => setEndHHMM(e.target.value)} placeholder="17:00" />
                  <div className="quick">
                    {Array.from({ length: 14 }, (_, i) => i + 8).map((h) => (
                      <button
                        key={h}
                        className="chip"
                        type="button"
                        onClick={() => setEndHHMM(`${String(h).padStart(2, "0")}:00`)}
                      >
                        {String(h).padStart(2, "0")}:00
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Note</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionnel" />
              </div>

              {msg ? <div className="msg">{msg}</div> : null}

              <div className="actions">
                <button className="btn danger" type="button" onClick={clearShift} disabled={saving}>
                  Supprimer
                </button>
                <button className="btn primary" type="button" onClick={saveShift} disabled={saving}>
                  {saving ? "..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
