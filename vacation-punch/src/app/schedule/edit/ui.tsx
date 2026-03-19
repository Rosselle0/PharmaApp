"use client";
import "../schedule.css";
import "./edit.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Department = "FLOOR" | "CASH" | "LAB";

export type Employee = {
    id: string;
    firstName: string;
    lastName: string;
    department: Department;
};
export type AvailabilityRule = {
    employeeId: string;
    dayOfWeek: number;
    available: boolean;
    startHHMM: string;
    endHHMM: string;
};

type Shift = {
    id: string;
    employeeId: string;
    startTime: string; // ISO
    endTime: string;   // ISO
    note: string | null;
};

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];


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

function minutesFromHHMM(hhmm: string) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;

    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    return hh * 60 + mm;
}

function makeLocalDateTime(dayYMD: string, hhmm: string) {
    const d = new Date(dayYMD + "T00:00:00");
    const [hh, mm] = hhmm.split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    return d;
}

export default function ScheduleEditorClient(props: {
    weekStartYMD: string;
    daysYMD: string[];
    employees: Employee[];
    shifts: Shift[];
    availability: AvailabilityRule[];
    section: "CAISSE_LAB" | "FLOOR";
}) {
    const router = useRouter();

    function goSection(next: "CAISSE_LAB" | "FLOOR") {
        router.push(
            `/schedule/edit?week=${encodeURIComponent(props.weekStartYMD)}&section=${encodeURIComponent(next)}`
        );
    }

    const weekStart = new Date(props.weekStartYMD + "T12:00:00");
    const days = props.daysYMD.map((d) => new Date(d + "T12:00:00"));

    const [hoverDay, setHoverDay] = useState<number | null>(null);

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
    const [repeatWeekly, setRepeatWeekly] = useState(false);
    const [locked, setLocked] = useState(false);


    useEffect(() => {
        setShifts(props.shifts);
        setOpen(false);
        setMsg(null);
    }, [props.shifts, props.weekStartYMD]);

    const availabilityByEmpDay = useMemo(() => {
        const map = new Map<string, AvailabilityRule>();
        for (const rule of props.availability) {
            map.set(`${rule.employeeId}:${rule.dayOfWeek}`, rule);
        }
        return map;
    }, [props.availability]);

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
        setActiveDayISO(ymdLocal(day));

        const key = `${empId}:${ymdLocal(day)}`;
        const list = byEmpDay.get(key) ?? [];
        const availability = availabilityByEmpDay.get(`${empId}:${day.getDay()}`);

        if (!list[0] && !availability?.available) {
            return;
        }

        if (list[0]) {
            const s = list[0];
            setStartHHMM(hm(new Date(s.startTime)));
            setEndHHMM(hm(new Date(s.endTime)));
            setNote(s.note ?? "");
        } else {
            setStartHHMM(availability?.startHHMM ?? "08:00");
            setEndHHMM(availability?.endHHMM ?? "17:00");
            setNote("");
        }
        setRepeatWeekly(false);
        setLocked(false);

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

        const availability = availabilityByEmpDay.get(`${activeEmployeeId}:${new Date(activeDayISO + "T12:00:00").getDay()}`);
        if (!availability?.available) {
            setMsg("Employé indisponible cette journée.");
            return;
        }

        const shiftStart = minutesFromHHMM(st);
        const shiftEnd = minutesFromHHMM(en);
        const availStart = minutesFromHHMM(availability.startHHMM);
        const availEnd = minutesFromHHMM(availability.endHHMM);

        if (
            shiftStart === null ||
            shiftEnd === null ||
            availStart === null ||
            availEnd === null
        ) {
            setMsg("Disponibilité invalide pour cet employé.");
            return;
        }

        if (shiftStart < availStart || shiftEnd > availEnd) {
            setMsg(`Disponibilité: ${availability.startHHMM} à ${availability.endHHMM}.`);
            return;
        }

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
                    repeatWeekly,
                    locked,
                    dayOfWeek: new Date(activeDayISO + "T12:00:00").getDay(),

                }),
            });

            // ✅ clean error message (no JSON blob in the input)
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Erreur");

            const saved: Shift = data.shift;

            const keyDay = activeDayISO;

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
        const keyDay = activeDayISO;


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
        <main className="page scheduleScope">
            <div className="shell">
                <div className="head">
                    <div>
                        <h1 className="h1">Création Horaire</h1>
                        <p className="p">Clique une case vide → ajoute une plage (08:00–21:00). Total se calcule tout seul.</p>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => goSection("CAISSE_LAB")}
                                style={
                                    props.section === "CAISSE_LAB"
                                        ? {
                                              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                              color: "white",
                                              border: "1px solid rgba(37, 99, 235, 0.35)",
                                          }
                                        : undefined
                                }
                            >
                                HORAIRE CAISSE/LAB
                            </button>

                            <button
                                type="button"
                                className="btn"
                                onClick={() => goSection("FLOOR")}
                                style={
                                    props.section === "FLOOR"
                                        ? {
                                              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                              color: "white",
                                              border: "1px solid rgba(37, 99, 235, 0.35)",
                                          }
                                        : undefined
                                }
                            >
                                HORAIRE PLANCHER
                            </button>
                        </div>
                    </div>

                    <div
                        className="row"
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 10,
                            flexWrap: "wrap",
                        }}
                    >
                        <a
                            className="btn"
                            href={`/schedule/edit?week=${encodeURIComponent(prevWeek)}&section=${encodeURIComponent(props.section)}`}
                        >
                            ← Semaine précédente
                        </a>

                        <a
                            className="btn"
                            href={`/schedule/edit?week=${encodeURIComponent(nextWeek)}&section=${encodeURIComponent(props.section)}`}
                        >
                            Semaine suivante →
                        </a>

                        <a className="btn" href="/admin/dashboard">
                            Retour
                        </a>
                    </div>

                </div>

                <div className="section">
                    <div className="sectionTop">
                        <div className="sectionTitle">
                            Semaine du {weekStart.toLocaleDateString("fr-CA")}
                        </div>
                        <div className="meta">Admin editor</div>
                    </div>

                    <div className="tableWrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="th sticky">Employé</th>
                                    {days.map((d, i) => (
                                        <th
                                            key={ymdLocal(d)}
                                            className={`th dayTh ${hoverDay === i ? "dayHover" : ""}`}
                                            onMouseEnter={() => setHoverDay(i)}
                                            onMouseLeave={() => setHoverDay(null)}
                                        >
                                            <div className="dayHead">
                                                <div className="dayTop">
                                                    <span>{DAY_LABELS[i]}</span>
                                                    <span className="dayEditTag">Modifier</span>
                                                </div>
                                                <span className="muted">{d.toLocaleDateString("fr-CA")}</span>
                                            </div>
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
                                            <div className="muted">
                                                {emp.department === "CASH"
                                                    ? "Caisse"
                                                    : emp.department === "LAB"
                                                        ? "Lab"
                                                        : "Plancher"}
                                            </div>

                                        </td>

                                        {days.map((d, i) => {
                                            const key = `${emp.id}:${ymdLocal(d)}`;
                                            const list = byEmpDay.get(key) ?? [];

                                            const availability = availabilityByEmpDay.get(`${emp.id}:${d.getDay()}`);
                                            const unavailable = !availability?.available;
                                            const canOpen = list.length > 0 || !unavailable;

                                            return (
                                                <td
                                                    key={key}
                                                    className={`td cell ${list.length ? "filled" : "empty"} ${unavailable ? "unavailable" : ""} ${hoverDay === i ? "dayHoverCell" : ""}`}
                                                    onMouseEnter={() => setHoverDay(i)}
                                                    onMouseLeave={() => setHoverDay(null)}
                                                    onClick={canOpen ? () => openCell(emp.id, d) : undefined}
                                                    role={canOpen ? "button" : undefined}
                                                    tabIndex={canOpen ? 0 : -1}
                                                    aria-disabled={!canOpen}
                                                    title={unavailable ? "Employé indisponible cette journée" : undefined}
                                                >

                                                    {list.length === 0 ? (
                                                        unavailable ? (
                                                            <span className="cellBadge unavailableBadge">Indispo</span>
                                                        ) : (
                                                            <span className="muted">+</span>
                                                        )
                                                    ) : (
                                                        list.map((s) => (
                                                            <div key={s.id} className="pill" title={s.note ?? ""}>
                                                                <span className="pillTime">{hm(new Date(s.startTime))}</span>
                                                                <span className="pillDash">–</span>
                                                                <span className="pillTime">{hm(new Date(s.endTime))}</span>

                                                                {s.note ? (
                                                                    <span className="pillNote">
                                                                        <span className="pillNoteDot" aria-hidden="true">•</span>
                                                                        {s.note}
                                                                    </span>
                                                                ) : null}
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
                            <button className="modalClose" type="button" onClick={() => !saving && setOpen(false)}>✕</button>
                        </div>

                        <div className="form">
                            <div className="grid2">
                                <div className="field">
                                    <label>Début</label>
                                    <input value={startHHMM} onChange={(e) => setStartHHMM(e.target.value)} placeholder="08:00" />
                                        <div className="mutedSmall" style={{ marginTop: 8 }}>
                                            Tapez l’heure (HH:MM)
                                        </div>

                                </div>

                                <div className="field">
                                    <label>Fin</label>
                                    <input value={endHHMM} onChange={(e) => setEndHHMM(e.target.value)} placeholder="17:00" />
                                        <div className="mutedSmall" style={{ marginTop: 8 }}>
                                            Tapez l’heure (HH:MM)
                                        </div>

                                </div>
                            </div>

                            <div className="field">
                                <label>Note</label>
                                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionnel" />
                            </div>
                            <div className="grid2">
                                <label className="checkRow">
                                    <input
                                        type="checkbox"
                                        checked={repeatWeekly}
                                        onChange={(e) => setRepeatWeekly(e.target.checked)}
                                    />
                                    Répéter chaque semaine (template)
                                </label>

                                <label className="checkRow">
                                    <input
                                        type="checkbox"
                                        checked={locked}
                                        onChange={(e) => setLocked(e.target.checked)}
                                        disabled={!repeatWeekly}
                                    />
                                    Verrouiller
                                </label>
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
