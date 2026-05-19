"use client";

import { useEffect, useMemo, useState } from "react";
import { messageFromUnknown } from "@/lib/unknownError";
import "./creation-t.css";

type TemplateItem = { text: string; required: boolean };

type Template = {
  id: string;
  title: string;
  items: TemplateItem[];
};

type WorkingEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string; // exists in payload, but we won't display it
  department: string;
  startISO: string;
  endISO: string;
};

type DeptFilter = "ALL" | "CASH" | "LAB" | "FLOOR";

const DEPT_FILTERS: { id: DeptFilter; label: string }[] = [
  { id: "ALL", label: "Tous" },
  { id: "CASH", label: "Caisse" },
  { id: "LAB", label: "Lab" },
  { id: "FLOOR", label: "Plancher" },
];

function deptLabel(department: string) {
  const d = department.toUpperCase();
  if (d === "CASH") return "Caisse";
  if (d === "LAB") return "Lab";
  if (d === "FLOOR") return "Plancher";
  if (d === "MANAGER") return "Gérant";
  return department;
}

function matchesDeptFilter(department: string, filter: DeptFilter) {
  if (filter === "ALL") return true;
  return department.toUpperCase() === filter;
}

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function safeArrayUnknown(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function reorderTemplateItems(list: TemplateItem[], fromIndex: number, toIndex: number): TemplateItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return list;
  next.splice(toIndex, 0, item);
  return next;
}

type TaskChecklistProps = {
  lines: TemplateItem[];
  dragIndex: number | null;
  onDragStart: (idx: number) => void;
  onDragEnd: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdate: (idx: number, patch: Partial<TemplateItem>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
};

function TaskChecklist({
  lines,
  dragIndex,
  onDragStart,
  onDragEnd,
  onReorder,
  onUpdate,
  onRemove,
  onAdd,
}: TaskChecklistProps) {
  return (
    <div className="ctTasks">
      <div className="ctTasksBar">
        <span className="ctTasksLabel">Tâches</span>
        <button className="ctBtnAdd" type="button" onClick={onAdd}>
          + Ajouter
        </button>
      </div>

      <div className="ctList">
        {lines.length === 0 ? (
          <div className="ctEmpty">Aucune tâche</div>
        ) : (
          lines.map((l, idx) => (
            <div
              className={`ctLine${dragIndex === idx ? " dragging" : ""}`}
              key={idx}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex === null) return;
                onReorder(dragIndex, idx);
                onDragEnd();
              }}
            >
              <button
                type="button"
                className="ctLineIndex"
                aria-label={`Réordonner tâche ${idx + 1}`}
                title="Glisser pour réordonner"
              >
                {idx + 1}
              </button>
              <input
                className="ctLineInput"
                value={l.text}
                onChange={(e) => onUpdate(idx, { text: e.target.value })}
                placeholder={`Décrire la tâche ${idx + 1}…`}
              />
              <label className="ctCheck">
                <input
                  type="checkbox"
                  checked={l.required}
                  onChange={(e) => onUpdate(idx, { required: e.target.checked })}
                />
                <span>Requis</span>
              </label>
              <button className="ctIconBtn" type="button" onClick={() => onRemove(idx)} aria-label="Supprimer la tâche">
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function normalizeTemplates(payload: unknown): Template[] {
  let rawUnknown: unknown;
  if (Array.isArray(payload)) {
    rawUnknown = payload;
  } else {
    const p = asRecord(payload) ?? {};
    rawUnknown =
      p["templates"] ??
      asRecord(p["data"])?.["templates"] ??
      p["rows"] ??
      p["data"] ??
      payload ??
      [];
  }

  const rawArray = safeArrayUnknown(rawUnknown);

  return rawArray
    .map((tUnknown): Template | null => {
      const t = asRecord(tUnknown);
      if (!t) return null;
      const id = t["id"] ?? t["templateId"] ?? t["e_id"] ?? t["uuid"];
      const title = t["title"] ?? t["name"] ?? t["templateTitle"] ?? "";
      const itemsRaw =
        t["items"] ??
        t["tasks"] ??
        t["lines"] ??
        t["templateItems"] ??
        [];

      const items = safeArrayUnknown(itemsRaw)
        .map((xUnknown) => {
          const x = asRecord(xUnknown);
          const textSrc = x ? x["text"] ?? x["label"] ?? x["task"] ?? x["name"] : "";
          const reqVal = x?.["required"];
          return {
            text: normStr(textSrc).trim(),
            required: reqVal === undefined ? true : Boolean(reqVal),
          };
        })
        .filter((x) => x.text.length > 0);

      if (!id || !String(title).trim()) return null;
      return { id: String(id), title: String(title), items };
    })
    .filter(Boolean) as Template[];
}

export default function CreationTClient() {
  // -------------------
  // DATA
  // -------------------
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [workingEmployees, setWorkingEmployees] = useState<WorkingEmployee[]>([]);
  const [loadingWorking, setLoadingWorking] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);

  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [tab, setTab] = useState<"templates" | "custom">("templates");
  const [employeeId, setEmployeeId] = useState("");
  const [deptFilter, setDeptFilter] = useState<DeptFilter>("ALL");
  const [dateYMD, setDateYMD] = useState(ymd());
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customLines, setCustomLines] = useState<TemplateItem[]>([{ text: "", required: true }]);
  const [dragCustomIndex, setDragCustomIndex] = useState<number | null>(null);
  const [tmplEditId, setTmplEditId] = useState("");
  const [tmplEditTitle, setTmplEditTitle] = useState("");
  const [tmplEditLines, setTmplEditLines] = useState<TemplateItem[]>([{ text: "", required: true }]);
  const [dragTemplateIndex, setDragTemplateIndex] = useState<number | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [busyAssign, setBusyAssign] = useState(false);

  const assignSelectedTemplate = useMemo(
    () => templates.find((t) => t.id === assignTemplateId) ?? null,
    [templates, assignTemplateId]
  );
  const tmplSelected = useMemo(() => templates.find((t) => t.id === tmplEditId) ?? null, [templates, tmplEditId]);

  const filteredWorkingEmployees = useMemo(
    () => workingEmployees.filter((e) => matchesDeptFilter(e.department, deptFilter)),
    [workingEmployees, deptFilter]
  );

  useEffect(() => {
    if (employeeId && !filteredWorkingEmployees.some((e) => e.id === employeeId)) {
      setEmployeeId("");
    }
  }, [deptFilter, filteredWorkingEmployees, employeeId]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorking() {
      setLoadingWorking(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/admin/schedule/employees-working?date=${encodeURIComponent(dateYMD)}`,
          { cache: "no-store" }
        );
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(`Réponse non-JSON: ${text.slice(0, 120)}`);
        }
        const d = asRecord(data);
        if (!res.ok) throw new Error(String(d?.["error"] ?? "Failed to load working employees"));
        const list = safeArray<WorkingEmployee>(d?.["employees"]);
        if (!cancelled) {
          setWorkingEmployees(list);
          if (employeeId && !list.some((e) => e.id === employeeId)) setEmployeeId("");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setWorkingEmployees([]);
          setEmployeeId("");
          setMsg(messageFromUnknown(e) || "Erreur.");
        }
      } finally {
        if (!cancelled) setLoadingWorking(false);
      }
    }
    loadWorking();
    return () => {
      cancelled = true;
    };
  }, [dateYMD]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reloadTemplates() {
    setLoadingTemplates(true);
    setMsg(null);
    const urls = [
      "/api/admin/task-templates",
      "/api/admin/templates",
      "/api/task-templates",
      "/api/templates",
    ];
    let lastErr = "";
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          lastErr = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`;
          continue;
        }
        const normalized = normalizeTemplates(data);
        setTemplates(normalized);
        if (assignTemplateId && !normalized.some((t) => t.id === assignTemplateId)) setAssignTemplateId("");
        if (tmplEditId && !normalized.some((t) => t.id === tmplEditId)) setTmplEditId("");
        setLoadingTemplates(false);
        return;
      } catch (e: unknown) {
        lastErr = `fetch/json failed :: ${messageFromUnknown(e)}`;
      }
    }
    setTemplates([]);
    setMsg(`Templates load failed: ${lastErr}`);
    setLoadingTemplates(false);
  }

  useEffect(() => {
    reloadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!templatesVisible) return;
    if (!tmplSelected) return;
    setTmplEditTitle(tmplSelected.title);
    setTmplEditLines(
      tmplSelected.items.length
        ? tmplSelected.items.map((x) => ({ text: x.text, required: x.required }))
        : [{ text: "", required: true }]
    );
  }, [tmplSelected, templatesVisible]);

  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      if (!employeeId || !dateYMD || loadingWorking || !workingEmployees.length) return;
      const w = workingEmployees.find((e) => e.id === employeeId);
      if (!w?.employeeCode) return;
      try {
        const res = await fetch(
          `/api/tasks/my?code=${encodeURIComponent(w.employeeCode)}&date=${encodeURIComponent(dateYMD)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;
        const da = asRecord(data);
        const assignments = da?.["assignments"];
        const first = Array.isArray(assignments) ? assignments[0] : null;
        if (!first) {
          setTab("custom");
          setCustomTitle("");
          setAssignNotes("");
          setCustomLines([{ text: "", required: true }]);
          return;
        }
        const fr = asRecord(first);
        const existingTasks = Array.isArray(fr?.["tasks"]) ? fr["tasks"] : [];
        setTab("custom");
        setCustomTitle(String(fr?.["title"] ?? "Tâches"));
        setAssignNotes(String(fr?.["notes"] ?? ""));
        setCustomLines(
          existingTasks.length
            ? existingTasks.map((tUnknown) => {
                const t = asRecord(tUnknown);
                return { text: String(t?.["text"] ?? ""), required: !!t?.["required"] };
              })
            : [{ text: "", required: true }]
        );
      } catch {
        // keep editor state
      }
    }
    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [employeeId, dateYMD, loadingWorking, workingEmployees]);

  function addCustomLine() {
    setCustomLines((p) => [...p, { text: "", required: true }]);
  }
  function updateCustomLine(i: number, patch: Partial<TemplateItem>) {
    setCustomLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeCustomLine(i: number) {
    setCustomLines((p) => p.filter((_, idx) => idx !== i));
  }
  const cleanedCustomLines = useMemo(
    () => customLines.map((l) => ({ text: l.text.trim(), required: !!l.required })).filter((l) => l.text.length > 0),
    [customLines]
  );

  function addTmplLine() {
    setTmplEditLines((p) => [...p, { text: "", required: true }]);
  }
  function updateTmplLine(i: number, patch: Partial<TemplateItem>) {
    setTmplEditLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeTmplLine(i: number) {
    setTmplEditLines((p) => p.filter((_, idx) => idx !== i));
  }
  const cleanedTmplEditLines = useMemo(
    () => tmplEditLines.map((l) => ({ text: l.text.trim(), required: !!l.required })).filter((l) => l.text.length > 0),
    [tmplEditLines]
  );
  const canSaveTemplate = useMemo(
    () => tmplEditTitle.trim().length > 0 && cleanedTmplEditLines.length > 0,
    [tmplEditTitle, cleanedTmplEditLines]
  );

  const msgKind = useMemo(() => {
    if (!msg) return null;
    const m = msg.toLowerCase();
    if (msg.includes("✅") || m.includes("enregistré") || m.includes("supprimé") || m.includes("copié") || m.includes("créée"))
      return "ok";
    if (m.includes("failed") || m.includes("erreur") || m.includes("choisis") || m.includes("remplis")) return "err";
    return null;
  }, [msg]);

  const availability = useMemo(() => {
    const sector =
      deptFilter === "ALL" ? "" : ` (${DEPT_FILTERS.find((d) => d.id === deptFilter)?.label ?? deptFilter})`;
    if (loadingWorking) {
      return { tone: "loading" as const, text: "Vérification des disponibilités…" };
    }
    const n = filteredWorkingEmployees.length;
    if (n === 0) {
      return {
        tone: "empty" as const,
        text:
          deptFilter === "ALL"
            ? "Aucun employé planifié pour cette date"
            : `Aucun employé planifié${sector}`,
      };
    }
    if (n === 1) {
      return { tone: "ok" as const, text: `1 employé disponible${sector}` };
    }
    return { tone: "ok" as const, text: `${n} employés disponibles${sector}` };
  }, [loadingWorking, filteredWorkingEmployees.length, deptFilter]);

  function duplicateAssignTemplateToCustom() {
    if (!assignSelectedTemplate) return;
    setTab("custom");
    setCustomTitle(assignSelectedTemplate.title);
    setCustomLines(
      assignSelectedTemplate.items.length
        ? assignSelectedTemplate.items.map((x) => ({ text: x.text, required: x.required }))
        : [{ text: "", required: true }]
    );
    setMsg("Copié vers personnalisé.");
  }

  async function saveTemplate() {
    if (!canSaveTemplate || busySave) {
      setMsg("Remplis un titre + au moins 1 tâche.");
      return;
    }
    setBusySave(true);
    setMsg(null);
    const urls = ["/api/admin/task-templates", "/api/admin/templates", "/api/task-templates", "/api/templates"];
    const payload: Record<string, unknown> = {
      id: tmplEditId || undefined,
      title: tmplEditTitle.trim(),
      items: cleanedTmplEditLines,
      companyId: "1",
    };
    let lastError = "";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          lastError = `${url} -> non-JSON :: ${text.slice(0, 200)}`;
          continue;
        }
        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`;
          continue;
        }
        const dr = asRecord(data);
        const tpl = asRecord(dr?.["template"]);
        const innerData = asRecord(dr?.["data"]);
        const innerTpl = asRecord(innerData?.["template"]);
        const newId = tpl?.["id"] ?? dr?.["id"] ?? dr?.["templateId"] ?? innerTpl?.["id"] ?? null;
        setMsg("Template enregistré.");
        await reloadTemplates();
        if (newId) setTmplEditId(String(newId));
        setBusySave(false);
        return;
      } catch (e: unknown) {
        lastError = `${url} -> fetch failed :: ${messageFromUnknown(e)}`;
      }
    }
    setMsg(`Erreur lors de l'enregistrement. ${lastError}`);
    setBusySave(false);
  }

  async function deleteTemplate() {
    if (busySave || !tmplEditId) {
      setMsg("Choisis un template à supprimer.");
      return;
    }
    if (!window.confirm("Supprimer ce template ?")) return;
    setBusySave(true);
    setMsg(null);
    const urls = ["/api/admin/task-templates", "/api/admin/templates", "/api/task-templates", "/api/templates"];
    let lastError = "";
    for (const base of urls) {
      const url = `${base}?id=${encodeURIComponent(tmplEditId)}`;
      try {
        const res = await fetch(url, { method: "DELETE" });
        const text = await res.text();
        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`;
          continue;
        }
        setMsg("Template supprimé.");
        setTmplEditId("");
        setTmplEditTitle("");
        setTmplEditLines([{ text: "", required: true }]);
        if (assignTemplateId === tmplEditId) setAssignTemplateId("");
        await reloadTemplates();
        setBusySave(false);
        return;
      } catch (e: unknown) {
        lastError = `${url} -> fetch failed :: ${messageFromUnknown(e)}`;
      }
    }
    setMsg(`Delete failed. ${lastError}`);
    setBusySave(false);
  }

  async function assignToEmployee() {
    if (busyAssign) return;
    if (!employeeId) return setMsg("Choisis un employé.");
    if (!dateYMD) return setMsg("Choisis une date.");
    if (tab === "templates" && !assignTemplateId) return setMsg("Choisis un modèle.");
    if (tab === "custom") {
      const hasTitle = customTitle.trim().length > 0;
      const hasItems = cleanedCustomLines.length > 0;
      const hasNotes = assignNotes.trim().length > 0;
      if (!hasTitle && !hasItems && !hasNotes) {
        return setMsg("Ajoute un titre, une tâche ou une note.");
      }
    }
    setBusyAssign(true);
    setMsg(null);
    const payload =
      tab === "templates"
        ? { employeeId, date: dateYMD, templateId: assignTemplateId, notes: assignNotes.trim() || null }
        : {
            employeeId,
            date: dateYMD,
            title: customTitle.trim() || null,
            items: cleanedCustomLines,
            notes: assignNotes.trim() || null,
          };
    const urls = [
      "/api/admin/task-assignments",
      "/api/admin/assign-tasks",
      "/api/task-assignments",
      "/api/assign-tasks",
    ];
    let lastError = "";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`;
          continue;
        }
        setMsg("✅ Assignation créée.");
        setAssignNotes("");
        if (tab === "custom") {
          setCustomTitle("");
          setCustomLines([{ text: "", required: true }]);
        }
        setBusyAssign(false);
        return;
      } catch (e: unknown) {
        lastError = `${url} -> fetch failed :: ${messageFromUnknown(e)}`;
      }
    }
    setMsg(`Assign failed. ${lastError}`);
    setBusyAssign(false);
  }

  return (
    <div className="ctPage">
      <style jsx global>{`
        select option {
          color: #0b0b10 !important;
          background: #ffffff !important;
        }
      `}</style>
      <div className="ctShell">
        <header className="ctHeader">
          <h1 className="ctTitle">Création de tâches</h1>
          <div className="ctHeaderActions">
            <button className="ctBtn" type="button" onClick={reloadTemplates} disabled={loadingTemplates}>
              {loadingTemplates ? "…" : "Rafraîchir"}
            </button>
            <button
              className={`ctBtn${templatesVisible ? " ctBtnActive" : ""}`}
              type="button"
              onClick={() => setTemplatesVisible((v) => !v)}
            >
              {templatesVisible ? "Masquer templates" : "Templates"}
            </button>
          </div>
        </header>

        {msg ? <div className={`ctMsg${msgKind ? ` ${msgKind}` : ""}`}>{msg}</div> : null}

        <div className={`ctLayout${templatesVisible ? " split" : ""}`}>
          <div className="ctCard ctCardMain">
            <div className="ctField">
              <label className="ctLabel">Date</label>
              <input className="ctInput" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div className="ctDeptFilter" role="group" aria-label="Secteur">
              {DEPT_FILTERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`ctDeptBtn${deptFilter === d.id ? " on" : ""}`}
                  aria-pressed={deptFilter === d.id}
                  onClick={() => setDeptFilter(d.id)}
                  disabled={loadingWorking}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="ctField">
              <label className="ctLabel">Employé</label>
              <select
                className="ctSelect"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={loadingWorking}
              >
                <option value="">
                  {loadingWorking
                    ? "Chargement…"
                    : filteredWorkingEmployees.length
                      ? "Choisir…"
                      : deptFilter === "ALL"
                        ? "Personne planifiée"
                        : `Aucun en ${deptLabel(deptFilter)}`}
                </option>
                {filteredWorkingEmployees.map((e) => {
                  const start = new Date(e.startISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const end = new Date(e.endISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} · {deptLabel(e.department)} · {start}–{end}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={`ctAvail ctAvail-${availability.tone}`} role="status" aria-live="polite">
              <span className="ctAvailIcon" aria-hidden>
                {availability.tone === "loading" ? "…" : availability.tone === "empty" ? "○" : "●"}
              </span>
              <span className="ctAvailText">{availability.text}</span>
            </div>

            <div className="ctMode" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "templates"}
                className={`ctModeBtn${tab === "templates" ? " on" : ""}`}
                onClick={() => setTab("templates")}
              >
                Modèle
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "custom"}
                className={`ctModeBtn${tab === "custom" ? " on" : ""}`}
                onClick={() => setTab("custom")}
              >
                Personnalisé
              </button>
            </div>

            {tab === "templates" ? (
              <div className="ctBlock">
                <label className="ctLabel">Modèle</label>
                <select
                  className="ctSelect"
                  value={assignTemplateId}
                  onChange={(e) => setAssignTemplateId(e.target.value)}
                  disabled={loadingTemplates}
                >
                  <option value="">{loadingTemplates ? "Chargement…" : "Choisir…"}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>

                {assignSelectedTemplate && assignSelectedTemplate.items.length > 0 ? (
                  <ul className="ctPreview">
                    {assignSelectedTemplate.items.map((item, i) => (
                      <li key={i}>{item.text}</li>
                    ))}
                  </ul>
                ) : null}

                <button
                  className="ctBtnLink"
                  type="button"
                  onClick={duplicateAssignTemplateToCustom}
                  disabled={!assignSelectedTemplate}
                >
                  Modifier en personnalisé
                </button>
              </div>
            ) : (
              <div className="ctBlock">
                <label className="ctLabel">Titre</label>
                <input
                  className="ctInput"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ex: Fermeture soir"
                />
                <TaskChecklist
                  lines={customLines}
                  dragIndex={dragCustomIndex}
                  onDragStart={setDragCustomIndex}
                  onDragEnd={() => setDragCustomIndex(null)}
                  onReorder={(from, to) => setCustomLines((prev) => reorderTemplateItems(prev, from, to))}
                  onUpdate={updateCustomLine}
                  onRemove={removeCustomLine}
                  onAdd={addCustomLine}
                />
              </div>
            )}

            <div className="ctBlock">
              <label className="ctLabel">Notes</label>
              <textarea
                className="ctTextarea"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Optionnel"
              />
            </div>

            <button
              className="ctSubmit"
              type="button"
              onClick={assignToEmployee}
              disabled={busyAssign || loadingWorking || filteredWorkingEmployees.length === 0}
            >
              {busyAssign ? "Envoi…" : "Assigner"}
            </button>
          </div>

          {templatesVisible ? (
            <div className="ctCard ctCardSide">
              <div className="ctSideHead">
                <h2 className="ctSideTitle">Templates</h2>
                <div className="ctSideTools">
                  <select
                    className="ctSelect"
                    value={tmplEditId}
                    onChange={(e) => setTmplEditId(e.target.value)}
                    disabled={loadingTemplates}
                  >
                    <option value="">{loadingTemplates ? "…" : "Choisir…"}</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ctBtn"
                    type="button"
                    onClick={() => {
                      setTmplEditId("");
                      setTmplEditTitle("");
                      setTmplEditLines([{ text: "", required: true }]);
                      setMsg(null);
                    }}
                  >
                    Nouveau
                  </button>
                </div>
              </div>

              <label className="ctLabel">Titre</label>
              <input
                className="ctInput"
                value={tmplEditTitle}
                onChange={(e) => setTmplEditTitle(e.target.value)}
                placeholder="Ex: Ouverture matin"
              />

              <TaskChecklist
                lines={tmplEditLines}
                dragIndex={dragTemplateIndex}
                onDragStart={setDragTemplateIndex}
                onDragEnd={() => setDragTemplateIndex(null)}
                onReorder={(from, to) => setTmplEditLines((prev) => reorderTemplateItems(prev, from, to))}
                onUpdate={updateTmplLine}
                onRemove={removeTmplLine}
                onAdd={addTmplLine}
              />

              <div className="ctSideActions">
                <button className="ctSubmit ctSubmitSmall" type="button" onClick={saveTemplate} disabled={busySave}>
                  {busySave ? "…" : "Enregistrer"}
                </button>
                <button className="ctBtnDanger" type="button" onClick={deleteTemplate} disabled={busySave || !tmplEditId}>
                  Supprimer
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
