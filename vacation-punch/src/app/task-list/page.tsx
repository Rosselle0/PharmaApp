"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./task-list.css";

type Assignment = {
    id: string;
    dateYMD: string;
    startHHMM: string | null;
    endHHMM: string | null;
    title: string;
    tasks: { id: string; text: string; done: boolean; required: boolean }[];
};

const PIN_LEN = 4;

function readEmployeeCodeFromUrlOrStorage(): string | null {
    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
    if (urlCode.length === PIN_LEN) return urlCode;

    const lsCode = (localStorage.getItem("kiosk_employee_code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
    if (lsCode.length === PIN_LEN) return lsCode;

    return null;
}

export default function TaskListPage() {
    const router = useRouter();

    const [code, setCode] = useState<string | null>(null);
    const [dateYMD, setDateYMD] = useState<string>(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    });

    const [loading, setLoading] = useState(true);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        const c = readEmployeeCodeFromUrlOrStorage();
        setCode(c);

        if (!c) {
            setLoading(false);
            setMsg("Veuillez entrer votre code via le kiosk.");
            return;
        }
    }, []);

    useEffect(() => {
        if (!code) return; // <-- this narrows code to string after here

        let cancelled = false;

        async function load() {
            setLoading(true);
            setMsg(null);

            try {
                const res = await fetch(
                    `/api/tasks/my?code=${encodeURIComponent(code!)}&date=${encodeURIComponent(dateYMD)}`,
                    { cache: "no-store" }
                );

                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.error || "Erreur de chargement.");

                if (!cancelled) setAssignments(data?.assignments ?? []);
            } catch (e: any) {
                if (!cancelled) setMsg(e?.message ?? "Erreur.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [code, dateYMD]);


    const totalDone = useMemo(() => {
        let done = 0, total = 0;
        for (const a of assignments) {
            for (const t of a.tasks) {
                total++;
                if (t.done) done++;
            }
        }
        return { done, total };
    }, [assignments]);

    async function toggleTask(assignmentId: string, taskId: string, nextDone: boolean) {
        if (!code) return;

        // optimistic update
        setAssignments((prev) =>
            prev.map((a) =>
                a.id !== assignmentId
                    ? a
                    : {
                        ...a,
                        tasks: a.tasks.map((t) => (t.id === taskId ? { ...t, done: nextDone } : t)),
                    }
            )
        );

        try {
            const res = await fetch(`/api/tasks/my/${encodeURIComponent(assignmentId)}/tasks/${encodeURIComponent(taskId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, done: nextDone }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Update failed");
        } catch (e: any) {
            // revert on failure
            setAssignments((prev) =>
                prev.map((a) =>
                    a.id !== assignmentId
                        ? a
                        : {
                            ...a,
                            tasks: a.tasks.map((t) => (t.id === taskId ? { ...t, done: !nextDone } : t)),
                        }
                )
            );
            setMsg(e?.message ?? "Erreur.");
            setTimeout(() => setMsg(null), 1600);
        }
    }
    const [employeeName, setEmployeeName] = useState<string | null>(null);

    useEffect(() => {
        const n = (localStorage.getItem("kiosk_employee_name") ?? "").trim();
        setEmployeeName(n || null);
    }, []);

    return (
        <main className="tlPage">
            <div className="tlShell">
                <div className="tlTop">
                    <div>
                        <h1 className="tlH1">Task list</h1>
                        <p className="tlP">
                            {employeeName ? (
                                <>Merci <b>{employeeName}</b> — Progression: <b>{totalDone.done}/{totalDone.total}</b></>
                            ) : (
                                <>Non connecté</>
                            )}
                        </p>
                    </div>

                    <div className="tlActions">
                        <button className="tlBtn" type="button" onClick={() => router.push(code ? `/kiosk?code=${encodeURIComponent(code)}` : "/kiosk")}>
                            ← Retour
                        </button>
                        <input className="tlDate" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
                    </div>
                </div>

                {msg && <div className="tlMsg">{msg}</div>}

                {loading ? (
                    <div className="tlCard"><div className="tlCardBody">Chargement…</div></div>
                ) : assignments.length === 0 ? (
                    <div className="tlCard"><div className="tlCardBody tlEmpty">Aucune tâche assignée pour cette date.</div></div>
                ) : (
                    <div className="tlGrid">
                        {assignments.map((a) => (
                            <section key={a.id} className="tlCard">
                                <div className="tlCardHead">
                                    <div>
                                        <div className="tlTitle">{a.title}</div>
                                        <div className="tlMeta">
                                            {a.dateYMD}
                                            {a.startHHMM && a.endHHMM ? ` • ${a.startHHMM}–${a.endHHMM}` : ""}
                                        </div>
                                    </div>
                                </div>

                                <div className="tlCardBody">
                                    <div className="tlTasks">
                                        {a.tasks.map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                className={`tlTask ${t.done ? "done" : ""}`}
                                                onClick={() => toggleTask(a.id, t.id, !t.done)}
                                            >
                                                <span className="tlCheck">{t.done ? "✓" : ""}</span>
                                                <span className="tlText">{t.text}</span>
                                                {t.required ? <span className="tlReq">REQ</span> : <span className="tlOpt">OPT</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
