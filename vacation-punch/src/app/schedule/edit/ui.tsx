"use client";
import { messageFromUnknown } from "@/lib/unknownError";
import { unpaidBreak30DeductionMinutes } from "@/lib/unpaidBreak30";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TIME_SCROLL_ITEM_H = 32;
const TIME_SCROLL_VIEW_H = 108;
const TIME_SCROLL_PAD = (TIME_SCROLL_VIEW_H - TIME_SCROLL_ITEM_H) / 2;

const BUSINESS_TIME_SLOTS: string[] = (() => {
    const out: string[] = [];
    for (let m = 8 * 60; m <= 21 * 60; m += 5) {
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        out.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    }
    return out;
})();

function nearestBusinessSlot(hhmm: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return "08:00";
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return "08:00";
    const total = h * 60 + min;
    const first = 8 * 60;
    const last = 21 * 60;
    const clamped = Math.max(first, Math.min(last, total));
    const rounded = Math.round((clamped - first) / 5) * 5 + first;
    const hh = Math.floor(rounded / 60);
    const mm = rounded % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Minutes part of HH:MM (for digit shortcuts preserving minutes). */
function minuteFromSlot(hhmm: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return 0;
    const min = Number(m[2]);
    return Number.isFinite(min) ? min : 0;
}

/** Accepts 9, 14, 14:30, 1430, 930, etc. → raw H:MM */
function parseLooseTime(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{1,2}:\d{1,2}$/.test(s)) {
        const [a, b] = s.split(":");
        const h = Number(a);
        const mm = Number(b);
        if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
        return `${h}:${String(mm).padStart(2, "0")}`;
    }
    const digits = s.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length === 1) return `${Number(digits)}:00`;
    if (digits.length === 2) return `${Number(digits)}:00`;
    if (digits.length === 3) {
        const h = Number(digits[0]);
        const mm = Number(digits.slice(1));
        if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
        return `${h}:${String(mm).padStart(2, "0")}`;
    }
    if (digits.length >= 4) {
        const h = Number(digits.slice(0, 2));
        const mm = Number(digits.slice(2, 4));
        if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
        return `${h}:${String(mm).padStart(2, "0")}`;
    }
    return null;
}

function TimeScrollColumn({
    label,
    value,
    onChange,
    disabled,
    active,
    columnId,
    isActiveColumn,
    onColumnActivate,
}: {
    label: string;
    value: string;
    onChange: (hhmm: string) => void;
    disabled?: boolean;
    active: boolean;
    columnId: "start" | "end";
    isActiveColumn: boolean;
    onColumnActivate: () => void;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [text, setText] = useState(value);

    const slotIndex = (v: string) => {
        const i = BUSINESS_TIME_SLOTS.indexOf(v);
        return i >= 0 ? i : 0;
    };

    useEffect(() => {
        setText(value);
    }, [value]);

    useEffect(() => {
        if (!active) return;
        const el = viewportRef.current;
        if (!el) return;
        const i = slotIndex(value);
        el.scrollTop =
            TIME_SCROLL_PAD + i * TIME_SCROLL_ITEM_H - TIME_SCROLL_VIEW_H / 2 + TIME_SCROLL_ITEM_H / 2;
    }, [value, active]);

    function commitTextInput() {
        const loose = parseLooseTime(text);
        if (!loose) {
            setText(value);
            return;
        }
        const clamped = clampToBusinessHours(loose);
        if (!clamped) {
            setText(value);
            return;
        }
        const next = nearestBusinessSlot(clamped);
        onChange(next);
        setText(next);
    }

    function pickFromScroll() {
        const el = viewportRef.current;
        if (!el || disabled) return;
        const raw =
            (el.scrollTop + TIME_SCROLL_VIEW_H / 2 - TIME_SCROLL_PAD - TIME_SCROLL_ITEM_H / 2) /
            TIME_SCROLL_ITEM_H;
        const i = Math.max(0, Math.min(BUSINESS_TIME_SLOTS.length - 1, Math.round(raw)));
        const next = BUSINESS_TIME_SLOTS[i];
        if (next !== value) onChange(next);
    }

    return (
        <div
            className={`field timePickerField timePickerColumn ${isActiveColumn ? "isActive" : ""}`}
            onMouseDown={() => onColumnActivate()}
        >
            <label id={`time-label-${columnId}`}>{label}</label>
            <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                data-schedule-time={columnId}
                className="timeReadoutInput"
                aria-labelledby={`time-label-${columnId}`}
                placeholder="ex. 9, 14:30, 1430"
                disabled={disabled}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commitTextInput}
                onFocus={() => onColumnActivate()}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commitTextInput();
                        (e.target as HTMLInputElement).blur();
                        return;
                    }
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const cur = nearestBusinessSlot(value);
                        let idx = BUSINESS_TIME_SLOTS.indexOf(cur);
                        if (idx < 0) idx = 0;
                        const nidx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
                        const clamped = Math.max(0, Math.min(BUSINESS_TIME_SLOTS.length - 1, nidx));
                        onChange(BUSINESS_TIME_SLOTS[clamped]);
                    }
                }}
            />
            <div
                className="timeScrollViewport"
                ref={viewportRef}
                tabIndex={-1}
                onMouseDown={() => onColumnActivate()}
                onScroll={() => {
                    if (disabled) return;
                    if (scrollTimer.current) clearTimeout(scrollTimer.current);
                    scrollTimer.current = setTimeout(pickFromScroll, 70);
                }}
                style={{
                    opacity: disabled ? 0.55 : 1,
                    pointerEvents: disabled ? "none" : "auto",
                }}
            >
                <div className="timeScrollTrack">
                    <div className="timeScrollPad" style={{ height: TIME_SCROLL_PAD }} aria-hidden />
                    {BUSINESS_TIME_SLOTS.map((t) => (
                        <button
                            key={t}
                            type="button"
                            className={`timeScrollItem ${t === value ? "sel" : ""}`}
                            onClick={() => !disabled && onChange(t)}
                        >
                            {t}
                        </button>
                    ))}
                    <div className="timeScrollPad" style={{ height: TIME_SCROLL_PAD }} aria-hidden />
                </div>
            </div>
        </div>
    );
}

type Department = "FLOOR" | "CASH" | "LAB";

export type Employee = {
    id: string;
    firstName: string;
    lastName: string;
    department: Department;
    paidBreak30: boolean;
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
    source: "MANUAL" | "RECURRING";
    ruleLocked: boolean;
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
    const min = Number(m[2]);
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
    const searchParams = useSearchParams();
    const orderKey = `schedule-edit-order:${props.section}`;

    function goSection(next: "CAISSE_LAB" | "FLOOR", order: string[]) {
        const orderParam = order.join(",");
        router.push(
            `/schedule/edit?week=${encodeURIComponent(props.weekStartYMD)}&section=${encodeURIComponent(next)}&order=${encodeURIComponent(orderParam)}`
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
    const [isEditingExistingShift, setIsEditingExistingShift] = useState(false);
    const [initialRepeatWeekly, setInitialRepeatWeekly] = useState(false);
    const [initialLocked, setInitialLocked] = useState(false);
    const [activeTimeCol, setActiveTimeCol] = useState<"start" | "end">("start");
    const [employeeOrder, setEmployeeOrder] = useState<string[]>(() => props.employees.map((e) => e.id));
    const [dragEmployeeId, setDragEmployeeId] = useState<string | null>(null);
    const activeTimeColRef = useRef(activeTimeCol);
    activeTimeColRef.current = activeTimeCol;
    const hourDigitBufRef = useRef("");
    const hourDigitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (open) setActiveTimeCol("start");
    }, [open]);

    useEffect(() => {
        if (!open) {
            hourDigitBufRef.current = "";
            if (hourDigitTimerRef.current) {
                clearTimeout(hourDigitTimerRef.current);
                hourDigitTimerRef.current = null;
            }
            return;
        }

        function flushHourDigits() {
            const s = hourDigitBufRef.current;
            hourDigitBufRef.current = "";
            if (hourDigitTimerRef.current) {
                clearTimeout(hourDigitTimerRef.current);
                hourDigitTimerRef.current = null;
            }
            if (!s || !/^\d+$/.test(s)) return;
            const n = parseInt(s, 10);
            let h: number | null = null;
            if (s.length === 1) {
                if (n === 8 || n === 9) h = n;
            } else if (n >= 8 && n <= 21) {
                h = n;
            }
            if (h === null) return;
            const col = activeTimeColRef.current;
            const apply = (prev: string) => {
                const mm = minuteFromSlot(nearestBusinessSlot(prev));
                return nearestBusinessSlot(`${h}:${String(mm).padStart(2, "0")}`);
            };
            if (col === "start") setStartHHMM(apply);
            else setEndHHMM(apply);
        }

        function onKey(e: KeyboardEvent) {
            const el = e.target as HTMLElement | null;
            if (el?.closest?.("[data-schedule-note]")) return;
            if (el?.closest?.("[data-schedule-time]")) return;

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const col = activeTimeColRef.current;
                const apply = (prev: string) => {
                    const cur = nearestBusinessSlot(prev);
                    let idx = BUSINESS_TIME_SLOTS.indexOf(cur);
                    if (idx < 0) idx = 0;
                    const nidx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
                    const clamped = Math.max(0, Math.min(BUSINESS_TIME_SLOTS.length - 1, nidx));
                    return BUSINESS_TIME_SLOTS[clamped];
                };
                if (col === "start") setStartHHMM(apply);
                else setEndHHMM(apply);
                return;
            }

            if (!/^[0-9]$/.test(e.key)) return;
            e.preventDefault();
            hourDigitBufRef.current += e.key;
            if (hourDigitBufRef.current.length >= 2) {
                flushHourDigits();
                return;
            }
            if (hourDigitTimerRef.current) clearTimeout(hourDigitTimerRef.current);
            hourDigitTimerRef.current = setTimeout(flushHourDigits, 420);
        }

        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            if (hourDigitTimerRef.current) {
                clearTimeout(hourDigitTimerRef.current);
                hourDigitTimerRef.current = null;
            }
            hourDigitBufRef.current = "";
        };
    }, [open]);

    useEffect(() => {
        setShifts(props.shifts);
        setOpen(false);
        setMsg(null);
        setIsEditingExistingShift(false);
        setInitialRepeatWeekly(false);
        setInitialLocked(false);
    }, [props.shifts, props.weekStartYMD]);

    useEffect(() => {
        const ids = props.employees.map((e) => e.id);
        const fromQuery = (searchParams.get("order") ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        const queryResolved = fromQuery.filter((id) => ids.includes(id));
        const queryOrder =
            queryResolved.length > 0
                ? [...queryResolved, ...ids.filter((id) => !queryResolved.includes(id))]
                : null;

        let storedOrder: string[] | null = null;
        if (typeof window !== "undefined") {
            const raw = localStorage.getItem(orderKey) ?? "";
            const parsed = raw
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
            const kept = parsed.filter((id) => ids.includes(id));
            if (kept.length > 0) {
                storedOrder = [...kept, ...ids.filter((id) => !kept.includes(id))];
            }
        }

        setEmployeeOrder((prev) => {
            if (queryOrder) return queryOrder;
            if (storedOrder) return storedOrder;
            const kept = prev.filter((id) => ids.includes(id));
            return [...kept, ...ids.filter((id) => !kept.includes(id))];
        });
    }, [props.employees, orderKey, searchParams]);

    useEffect(() => {
        if (typeof window === "undefined" || employeeOrder.length === 0) return;
        localStorage.setItem(orderKey, employeeOrder.join(","));
    }, [employeeOrder, orderKey]);

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

    const paidBreak30ByEmpId = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const e of props.employees) {
            map.set(e.id, !!e.paidBreak30);
        }
        return map;
    }, [props.employees]);

    const orderedEmployees = useMemo(() => {
        const byId = new Map(props.employees.map((e) => [e.id, e]));
        return employeeOrder
            .map((id) => byId.get(id))
            .filter((e): e is Employee => Boolean(e));
    }, [employeeOrder, props.employees]);

    function reorderEmployees(dragId: string, targetId: string) {
        if (!dragId || !targetId || dragId === targetId) return;
        setEmployeeOrder((prev) => {
            const from = prev.indexOf(dragId);
            const to = prev.indexOf(targetId);
            if (from < 0 || to < 0) return prev;
            const next = [...prev];
            next.splice(from, 1);
            next.splice(to, 0, dragId);
            return next;
        });
    }

    function calcTotalHours(employeeId: string) {
        let mins = 0;
        const paidBreak30 = paidBreak30ByEmpId.get(employeeId) ?? true;
        for (const s of shifts) {
            if (s.employeeId !== employeeId) continue;
            const a = new Date(s.startTime).getTime();
            const b = new Date(s.endTime).getTime();
            const rawMinutes = Math.floor((b - a) / 60000);
            const deductionMinutes = unpaidBreak30DeductionMinutes(paidBreak30, rawMinutes);
            mins += Math.max(0, rawMinutes - deductionMinutes);
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
            setStartHHMM(nearestBusinessSlot(hm(new Date(s.startTime))));
            setEndHHMM(nearestBusinessSlot(hm(new Date(s.endTime))));
            setNote(s.note ?? "");

            const isRecurring = s.source === "RECURRING";
            const prevRepeatWeekly = isRecurring;
            const prevLocked = isRecurring ? Boolean(s.ruleLocked) : false;

            setRepeatWeekly(prevRepeatWeekly);
            setLocked(prevLocked);
            setIsEditingExistingShift(true);
            setInitialRepeatWeekly(prevRepeatWeekly);
            setInitialLocked(prevLocked);
        } else {
            setStartHHMM(nearestBusinessSlot(availability?.startHHMM ?? "08:00"));
            setEndHHMM(nearestBusinessSlot(availability?.endHHMM ?? "17:00"));
            setNote("");

            setRepeatWeekly(false);
            setLocked(false);
            setIsEditingExistingShift(false);
            setInitialRepeatWeekly(false);
            setInitialLocked(false);
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
            const dayOfWeek = new Date(activeDayISO + "T12:00:00").getDay();
            const isUnlocking = initialRepeatWeekly && initialLocked && repeatWeekly && !locked;

            setShifts((prev) => {
                const filtered = prev.filter(
                    (s) =>
                        !(
                            s.employeeId === activeEmployeeId &&
                            ymdLocal(new Date(s.startTime)) === keyDay
                        )
                );
                const withUnlockRemoval = isUnlocking
                    ? filtered.filter((s) => {
                          if (s.employeeId !== activeEmployeeId) return true;
                          if (s.source !== "RECURRING") return true;
                          const sDow = new Date(s.startTime).getDay();
                          if (sDow !== dayOfWeek) return true;
                          // only remove future days (not the current keyDay)
                          return ymdLocal(new Date(s.startTime)) <= keyDay;
                      })
                    : filtered;

                return [...withUnlockRemoval, saved].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
            });

            setOpen(false);
        } catch (e: unknown) {
            setMsg(messageFromUnknown(e) || "Erreur");
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
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) throw new Error(data?.error || "Delete failed");

            setShifts((prev) => prev.filter((s) => s.id !== existing.id));
            setOpen(false);
        } catch (e: unknown) {
            setMsg(messageFromUnknown(e) || "Erreur");
        } finally {
            setSaving(false);
        }
    }

    const prevWeek = ymdLocal(new Date(weekStart.getTime() - 7 * 86400000));
    const nextWeek = ymdLocal(new Date(weekStart.getTime() + 7 * 86400000));
    const orderParam = encodeURIComponent(employeeOrder.join(","));
    const exportHref = `/api/schedule/export?week=${encodeURIComponent(props.weekStartYMD)}&section=${encodeURIComponent(
        props.section
    )}&order=${orderParam}`;

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
                                onClick={() => goSection("CAISSE_LAB", employeeOrder)}
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
                                onClick={() => goSection("FLOOR", employeeOrder)}
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
                            href={`/schedule/edit?week=${encodeURIComponent(prevWeek)}&section=${encodeURIComponent(props.section)}&order=${orderParam}`}
                        >
                            ← Semaine précédente
                        </a>

                        <a
                            className="btn"
                            href={`/schedule/edit?week=${encodeURIComponent(nextWeek)}&section=${encodeURIComponent(props.section)}&order=${orderParam}`}
                        >
                            Semaine suivante →
                        </a>
                    </div>

                </div>

                <div className="pdfRow">
                    <a
                        href={exportHref}
                        className="btn pdfBtn"
                        style={{
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            fontWeight: 700,
                        }}
                    >
                        ⬇ Télécharger PDF (2 semaines)
                    </a>
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
                                {orderedEmployees.map((emp) => (
                                    <tr
                                        key={emp.id}
                                        draggable
                                        onDragStart={() => setDragEmployeeId(emp.id)}
                                        onDragEnd={() => setDragEmployeeId(null)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => {
                                            if (dragEmployeeId) reorderEmployees(dragEmployeeId, emp.id);
                                            setDragEmployeeId(null);
                                        }}
                                        className={dragEmployeeId === emp.id ? "scheduleDragRow" : undefined}
                                    >
                                        <td className="td sticky">
                                            <div className="name">
                                                <span className="scheduleDragHandle" aria-hidden="true">≡</span>
                                                {emp.firstName} {emp.lastName}
                                            </div>
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
                    <div className="modal scheduleEditModal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modalHead">
                            <div>
                                <div className="modalTitle">Ajouter / Modifier</div>
                                <div className="mutedSmall">Plage: 08:00–21:00</div>
                            </div>
                            <button className="modalClose" type="button" onClick={() => !saving && setOpen(false)}>✕</button>
                        </div>

                        <div className="form">
                            <div className="grid2 timeScrollGrid">
                                <TimeScrollColumn
                                    label="Début"
                                    columnId="start"
                                    isActiveColumn={activeTimeCol === "start"}
                                    onColumnActivate={() => setActiveTimeCol("start")}
                                    value={nearestBusinessSlot(startHHMM)}
                                    onChange={(v) => setStartHHMM(v)}
                                    disabled={saving}
                                    active={open}
                                />
                                <TimeScrollColumn
                                    label="Fin"
                                    columnId="end"
                                    isActiveColumn={activeTimeCol === "end"}
                                    onColumnActivate={() => setActiveTimeCol("end")}
                                    value={nearestBusinessSlot(endHHMM)}
                                    onChange={(v) => setEndHHMM(v)}
                                    disabled={saving}
                                    active={open}
                                />
                            </div>
                            <div className="mutedSmall timePickerHint">
                                Cliquez Début ou Fin : chiffres au clavier (9 → 9h00, 14 → 14h00, 1430 → 14h30), champ éditable, flèches ±5 min hors du champ, ou liste défilante.
                            </div>

                            <div className="field">
                                <label>Note</label>
                                <input
                                    data-schedule-note
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Optionnel"
                                />
                            </div>
                            <div className="grid2">
                                <label className="checkRow">
                                    <input
                                        type="checkbox"
                                        checked={repeatWeekly}
                                        onChange={(e) => {
                                            const on = e.target.checked;
                                            setRepeatWeekly(on);
                                            if (on) setLocked(true);
                                            else setLocked(false);
                                        }}
                                    />
                                    Répéter chaque semaine
                                </label>

                                <label className="checkRow">
                                    <input
                                        type="checkbox"
                                        checked={locked}
                                        onChange={(e) => setLocked(e.target.checked)}
                                        disabled={!repeatWeekly}
                                    />
                                    {locked ? "Déverrouiller" : "Verrouiller"}
                                </label>
                            </div>


                            {msg ? <div className="msg">{msg}</div> : null}

                            <div className="actions">
                                {isEditingExistingShift ? (
                                    <button className="btn danger" type="button" onClick={clearShift} disabled={saving}>
                                        Supprimer
                                    </button>
                                ) : null}
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
