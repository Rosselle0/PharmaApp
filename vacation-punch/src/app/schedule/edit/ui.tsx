"use client";
import "../schedule.css";
import "./edit.css";
import { useEffect, useMemo, useState } from "react";

type Department = "FLOOR" | "CASH" | "LAB";

export type Employee = {
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

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];


const TIME_OPTIONS = Array.from({ length: 14 }, (_, i) => {
    const h = i + 8; // 8..21
    return `${String(h).padStart(2, "0")}:00`;
});


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
}) {
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
        <main className="page">
            <div className="shell">
                <div className="head">
                    <div>
                        <h1 className="h1">Création Horaire</h1>
                        <p className="p">Clique une case vide → ajoute une plage (08:00–21:00). Total se calcule tout seul.</p>
                    </div>

                    <div className="row">
                        <a className="btn" href={`/schedule/edit?week=${encodeURIComponent(prevWeek)}`}>
                            ← Semaine précédente
                        </a>

                        <a className="btn" href={`/schedule/edit?week=${encodeURIComponent(nextWeek)}`}>
                            Semaine suivante →
                        </a>

                        <a className="btn" href="/admin/dashboard">
                            Retour
                        </a>

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

                                            return (
                                                <td
                                                    key={key}
                                                    className={`td cell ${list.length ? "filled" : "empty"} ${hoverDay === i ? "dayHoverCell" : ""}`}
                                                    onMouseEnter={() => setHoverDay(i)}
                                                    onMouseLeave={() => setHoverDay(null)}
                                                    onClick={() => openCell(emp.id, d)}
                                                    role="button"
                                                    tabIndex={0}
                                                >

                                                    {list.length === 0 ? (
                                                        <span className="muted">+</span>
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
                                    <div className="quick">
                                        {TIME_OPTIONS.map((t) => (
                                            <button

                                                key={t}
                                                className={`chip ${startHHMM === t ? "chipActive" : ""}`}
                                                type="button"
                                                onClick={() => setStartHHMM(t)}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>

                                </div>

                                <div className="field">
                                    <label>Fin</label>
                                    <input value={endHHMM} onChange={(e) => setEndHHMM(e.target.value)} placeholder="17:00" />
                                    <div className="quick">
                                        {TIME_OPTIONS.map((t) => (
                                            <button
                                                key={t}
                                                className={`chip ${endHHMM === t ? "chipActive" : ""}`}
                                                type="button"
                                                onClick={() => setEndHHMM(t)}
                                            >
                                                {t}
                                            </button>
                                        ))}
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
