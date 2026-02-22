"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./task-list.css";
import KioskSidebar from "@/components/KioskSidebar"; // adjust path if needed

// ---------- Types ----------
type Task = { id: string; text: string; done: boolean; required: boolean };
type Assignment = {
  id: string;
  dateYMD?: string;
  startHHMM?: string | null;
  endHHMM?: string | null;
  title: string;
  notes?: string | null;
  tasks: Task[];
};

const PIN_LEN = 8;

// ---------- Helper functions ----------
function readEmployeeCodeFromUrlOrStorage(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
  if (urlCode.length === PIN_LEN) return urlCode;

  const lsCode = (localStorage.getItem("kiosk_employee_code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
  if (lsCode.length === PIN_LEN) return lsCode;

  return null;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function normTask(raw: any): Task | null {
  const id = raw?.id ?? raw?.taskId ?? raw?.itemId;
  const text = raw?.text ?? raw?.label ?? raw?.name ?? raw?.task;
  if (!id || !String(text ?? "").trim()) return null;

  return {
    id: String(id),
    text: String(text),
    done: Boolean(raw?.done),
    required: raw?.required === undefined ? true : Boolean(raw?.required),
  };
}

function normalizeAssignments(payload: any): Assignment[] {
  const rawAssignments =
    payload?.assignments ?? payload?.data?.assignments ?? payload?.rows ?? payload?.data ?? payload ?? [];

  return safeArray<any>(rawAssignments)
    .map((a) => {
      const id = a?.id ?? a?.assignmentId;
      if (!id) return null;

      const title = String(a?.title ?? a?.name ?? "Tâches");
      const dateYMD = a?.dateYMD ?? a?.date ?? a?.ymd ?? null;
      const startHHMM = a?.startHHMM ?? a?.start ?? null;
      const endHHMM = a?.endHHMM ?? a?.end ?? null;
      const notes = a?.notes ?? a?.note ?? a?.message ?? null;

      const rawTasks = a?.tasks ?? a?.items ?? a?.taskItems ?? a?.assignmentItems ?? [];
      const tasks: Task[] = safeArray<any>(rawTasks).map(normTask).filter(Boolean) as Task[];

      return {
        id: String(id),
        title,
        dateYMD: dateYMD ? String(dateYMD).slice(0, 10) : undefined,
        startHHMM,
        endHHMM,
        notes: notes ? String(notes) : null,
        tasks,
      } as Assignment;
    })
    .filter(Boolean) as Assignment[];
}

// ---------- Component ----------
export default function TaskListPage() {
  const router = useRouter();

  const [code, setCode] = useState<string | null>(null);
  const [dateYMD, setDateYMD] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);

  // ---------- Load code & employee ----------
  useEffect(() => {
    const c = readEmployeeCodeFromUrlOrStorage();
    setCode(c);

    const n = (localStorage.getItem("kiosk_employee_name") ?? "").trim();
    setEmployeeName(n || null);

    if (!c) {
      setLoading(false);
      setMsg("Veuillez entrer votre code via le kiosk.");
    }
  }, []);

  // ---------- Load assignments ----------
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        // ✅ non-null assertion for code
        const res = await fetch(
          `/api/tasks/my?code=${encodeURIComponent(code!)}&date=${encodeURIComponent(dateYMD)}`,
          { cache: "no-store" }
        );

        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch {}

        if (!res.ok) throw new Error(data?.error || "Erreur de chargement.");

        const normalized = normalizeAssignments(data);
        if (!cancelled) setAssignments(normalized);
      } catch (e: any) {
        if (!cancelled) { setAssignments([]); setMsg(e?.message ?? "Erreur."); }
      } finally { if (!cancelled) setLoading(false); }
    }

    load();
    return () => { cancelled = true; };
  }, [code, dateYMD]);

  const totalDone = useMemo(() => {
    let done = 0, total = 0;
    for (const a of assignments) {
      for (const t of safeArray<Task>(a.tasks)) { total++; if (t.done) done++; }
    }
    return { done, total };
  }, [assignments]);

  async function toggleTask(assignmentId: string, taskId: string, nextDone: boolean) {
    if (!code) return;

    // Optimistic update
    setAssignments(prev =>
      prev.map(a =>
        a.id !== assignmentId
          ? a
          : { ...a, tasks: a.tasks.map(t => t.id === taskId ? { ...t, done: nextDone } : t) }
      )
    );

    try {
      const res = await fetch(
        `/api/tasks/my/${encodeURIComponent(assignmentId)}/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, done: nextDone }),
        }
      );

      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) throw new Error(data?.error || "Update failed");
    } catch (e: any) {
      // revert on failure
      setAssignments(prev =>
        prev.map(a =>
          a.id !== assignmentId
            ? a
            : { ...a, tasks: a.tasks.map(t => t.id === taskId ? { ...t, done: !nextDone } : t) }
        )
      );
      setMsg(e?.message ?? "Erreur.");
      setTimeout(() => setMsg(null), 1600);
    }
  }

  // ---------- Layout ----------
  return (
    <div className="kiosk-layout">
      <KioskSidebar />

      <main className="tlPage scheduleScope page" style={{ flex: 1 }}>
        <div className="tlContent">
          <div className="head">
            <div>
              <h1 className="h1">Liste des tâches</h1>
              <p className="p">
                {employeeName
                  ? <>Merci <b>{employeeName}</b> — Progression: <b>{totalDone.done}/{totalDone.total}</b></>
                  : <>Non connecté</>
                }
              </p>
            </div>

            <div className="row">
              <input className="btn" type="date" value={dateYMD} onChange={e => setDateYMD(e.target.value)} />
            </div>
          </div>

          {msg && <div className="empty">{msg}</div>}

          {loading ? (
            <div className="section">
              <div className="sectionTop">Chargement…</div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="section">
              <div className="empty">Aucune tâche assignée pour cette date.</div>
            </div>
          ) : (
            assignments.map(a => (
              <section key={a.id} className="section">
                <div className="sectionTop">
                  <h2 className="sectionTitle">{a.title}</h2>
                  <div className="meta">
                    {a.dateYMD ?? dateYMD}
                    {a.startHHMM && a.endHHMM ? ` • ${a.startHHMM}–${a.endHHMM}` : ""}
                  </div>
                </div>

                <div className="tableWrap">
                  {a.tasks.map(t => (
                    <button
                      key={t.id}
                      className={`kiosk-btn ${t.done ? "active" : ""}`}
                      onClick={() => toggleTask(a.id, t.id, !t.done)}
                    >
                      <span>{t.done ? "✓" : ""}</span> {t.text} {t.required ? "(REQ)" : "(OPT)"}
                    </button>
                  ))}
                </div>

                {a.notes?.trim() && <div className="empty"><b>Notes:</b> {a.notes}</div>}
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}