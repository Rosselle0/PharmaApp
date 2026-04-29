"use client";

import { messageFromUnknown } from "@/lib/unknownError";
import { useEffect, useMemo, useState, Suspense } from "react";
import "./task-list.css";
import KioskSidebar from "@/components/KioskSidebar";

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

const PIN_LEN = 4;

// ---------- Helpers ----------
function readEmployeeCodeFromUrlOrStorage(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
  if (urlCode.length === PIN_LEN) return urlCode;

  const lsCode = (window.sessionStorage.getItem("kiosk_employee_code") ?? "").replace(/\D/g, "").slice(0, PIN_LEN);
  if (lsCode.length === PIN_LEN) return lsCode;

  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function firstWord(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] ?? "";
}

function normTask(raw: unknown): Task | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = r["id"] ?? r["taskId"] ?? r["itemId"];
  const text = r["text"] ?? r["label"] ?? r["name"] ?? r["task"];
  if (!id || !String(text ?? "").trim()) return null;

  return {
    id: String(id),
    text: String(text),
    done: Boolean(r["done"]),
    required: r["required"] === undefined ? true : Boolean(r["required"]),
  };
}

function normalizeAssignments(payload: unknown): Assignment[] {
  let rawAssignments: unknown;
  if (Array.isArray(payload)) {
    rawAssignments = payload;
  } else {
    const p = asRecord(payload) ?? {};
    rawAssignments =
      p["assignments"] ??
      asRecord(p["data"])?.["assignments"] ??
      p["rows"] ??
      p["data"] ??
      payload ??
      [];
  }

  const rawArr = Array.isArray(rawAssignments) ? rawAssignments : [];

  return rawArr
    .map((aUnknown): Assignment | null => {
      const a = asRecord(aUnknown);
      if (!a) return null;
      const id = a["id"] ?? a["assignmentId"];
      if (!id) return null;

      const title = String(a["title"] ?? a["name"] ?? "Tâches");
      const dateYMD = a["dateYMD"] ?? a["date"] ?? a["ymd"] ?? null;
      const startHHMM = a["startHHMM"] ?? a["start"] ?? null;
      const endHHMM = a["endHHMM"] ?? a["end"] ?? null;
      const notes = a["notes"] ?? a["note"] ?? a["message"] ?? null;

      const rawTasks = a["tasks"] ?? a["items"] ?? a["taskItems"] ?? a["assignmentItems"] ?? [];
      const taskList = Array.isArray(rawTasks) ? rawTasks : [];
      const tasks: Task[] = taskList.map(normTask).filter(Boolean) as Task[];

      return {
        id: String(id),
        title,
        dateYMD: dateYMD ? String(dateYMD).slice(0, 10) : undefined,
        startHHMM: startHHMM as string | null | undefined,
        endHHMM: endHHMM as string | null | undefined,
        notes: notes ? String(notes) : null,
        tasks,
      };
    })
    .filter(Boolean) as Assignment[];
}

// ---------- Page Component ----------
export default function TaskListPage() {
  const [code, setCode] = useState<string | null>(null);
  const [dateYMD, setDateYMD] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [kioskRole, setKioskRole] = useState<string | null>(null);
  const [employeeLogged, setEmployeeLogged] = useState(false);

  // Load code & employee info
  useEffect(() => {
    const c = readEmployeeCodeFromUrlOrStorage();
    setCode(c);

    const n = (window.sessionStorage.getItem("kiosk_employee_name") ?? "").trim();
    setEmployeeName(firstWord(n) || null);

    const role = (window.sessionStorage.getItem("kiosk_role") ?? "").toUpperCase().trim() || null;
    setKioskRole(role);

    setEmployeeLogged(window.sessionStorage.getItem("kiosk_employee_logged") === "1");

    if (!c) {
      setLoading(false);
      setMsg("Veuillez entrer votre code via le kiosk.");
    }
  }, []);

  const isPrivilegedLogged = kioskRole === "ADMIN" || kioskRole === "MANAGER";

  // Load assignments
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const res = await fetch(`/api/tasks/my?code=${encodeURIComponent(code!)}&date=${encodeURIComponent(dateYMD)}`, { cache: "no-store" });
        const text = await res.text();
        let data: unknown = null;
        try { data = text ? JSON.parse(text) : null } catch {}

        const dr = asRecord(data);
        if (!res.ok) throw new Error(String(dr?.["error"] ?? "Erreur de chargement."));
        const normalized = normalizeAssignments(data);
        if (!cancelled) setAssignments(normalized);
      } catch (e: unknown) {
        if (!cancelled) { setAssignments([]); setMsg(messageFromUnknown(e) || "Erreur."); }
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

    setAssignments(prev =>
      prev.map(a => a.id !== assignmentId ? a : { ...a, tasks: a.tasks.map(t => t.id === taskId ? { ...t, done: nextDone } : t) })
    );

    try {
      const res = await fetch(`/api/tasks/my/${encodeURIComponent(assignmentId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, done: nextDone }),
      });
      const text = await res.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null } catch {}
      const dr = asRecord(data);
      if (!res.ok) throw new Error(String(dr?.["error"] ?? "Update failed"));
    } catch (e: unknown) {
      setAssignments(prev =>
        prev.map(a => a.id !== assignmentId ? a : { ...a, tasks: a.tasks.map(t => t.id === taskId ? { ...t, done: !nextDone } : t) })
      );
      setMsg(messageFromUnknown(e) || "Erreur.");
      setTimeout(() => setMsg(null), 1600);
    }
  }

  return (
    <div className="taskListScope">
      {/* Sidebar with required props */}
      <Suspense fallback={<div>Loading menu…</div>}>
        <KioskSidebar
          isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={code}
        />
      </Suspense>

      <main className="tlPage page">
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
            <div className="section"><div className="sectionTop">Chargement…</div></div>
          ) : assignments.length === 0 ? (
            <div className="section"><div className="empty">Aucune tâche assignée pour cette date.</div></div>
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
                    <button key={t.id} className={`kiosk-btn ${t.done ? "active" : ""}`} onClick={() => toggleTask(a.id, t.id, !t.done)}>
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