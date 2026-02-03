"use client";

import { useEffect, useMemo, useState } from "react";
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
  employeeCode: string; // still exists in payload, but we won't display it
  department: string;
  startISO: string;
  endISO: string;
};

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeTemplates(payload: any): Template[] {
  const raw =
    payload?.templates ??
    payload?.data?.templates ??
    payload?.rows ??
    payload?.data ??
    payload ??
    [];

  return safeArray<any>(raw)
    .map((t) => {
      const id = t?.id ?? t?.templateId ?? t?.e_id ?? t?.uuid;
      const title = t?.title ?? t?.name ?? t?.templateTitle ?? "";
      const itemsRaw = t?.items ?? t?.tasks ?? t?.lines ?? t?.templateItems ?? [];

      const items = safeArray<any>(itemsRaw)
        .map((x) => ({
          text: normStr(x?.text ?? x?.label ?? x?.task ?? x?.name).trim(),
          required: x?.required === undefined ? true : Boolean(x?.required),
        }))
        .filter((x) => x.text.length > 0);

      if (!id || !String(title).trim()) return null;

      return { id: String(id), title: String(title), items } as Template;
    })
    .filter(Boolean) as Template[];
}

export default function CreationTPage() {
  // -------------------
  // DATA
  // -------------------
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [workingEmployees, setWorkingEmployees] = useState<WorkingEmployee[]>([]);
  const [loadingWorking, setLoadingWorking] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);

  // -------------------
  // UI STATE
  // -------------------
  const [employeeId, setEmployeeId] = useState("");
  const [dateYMD, setDateYMD] = useState(ymd());

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<TemplateItem[]>([{ text: "", required: true }]);

  const [tab, setTab] = useState<"templates" | "custom">("templates");

  const [busySave, setBusySave] = useState(false);
  const [busyAssign, setBusyAssign] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  // -------------------
  // LOAD WORKING EMPLOYEES (BY DATE)
  // -------------------
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
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(`Réponse non-JSON: ${text.slice(0, 120)}`);
        }

        if (!res.ok) throw new Error(data?.error || "Failed to load working employees");

        const list = safeArray<WorkingEmployee>(data?.employees);

        if (!cancelled) {
          setWorkingEmployees(list);

          // reset selection if no longer valid
          if (employeeId && !list.some((e) => e.id === employeeId)) {
            setEmployeeId("");
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setWorkingEmployees([]);
          setEmployeeId("");
          setMsg(e?.message ?? "Erreur.");
        }
      } finally {
        if (!cancelled) setLoadingWorking(false);
      }
    }

    loadWorking();
    return () => {
      cancelled = true;
    };
    // IMPORTANT: do NOT depend on employeeId, or you'll refetch infinitely.
  }, [dateYMD]);

  // -------------------
  // LOAD TEMPLATES
  // -------------------
  async function reloadTemplates(keepSelection = true) {
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

        if (keepSelection && templateId) {
          const exists = normalized.some((t) => t.id === templateId);
          if (!exists) setTemplateId("");
        }

        setLoadingTemplates(false);
        return;
      } catch (e: any) {
        lastErr = `fetch/json failed :: ${e?.message ?? String(e)}`;
      }
    }

    setTemplates([]);
    setMsg(`Templates load failed: ${lastErr}`);
    setLoadingTemplates(false);
  }

  useEffect(() => {
    reloadTemplates(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When picking a template, mirror it into editor
  useEffect(() => {
    if (tab !== "templates") return;
    if (!selectedTemplate) return;

    setTitle(selectedTemplate.title);
    setLines(
      selectedTemplate.items.length
        ? selectedTemplate.items.map((x) => ({ text: x.text, required: x.required }))
        : [{ text: "", required: true }]
    );
  }, [selectedTemplate, tab]);

  // -------------------
  // EDITOR HELPERS
  // -------------------
  function addLine() {
    setLines((p) => [...p, { text: "", required: true }]);
  }

  function updateLine(i: number, patch: Partial<TemplateItem>) {
    setLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function removeLine(i: number) {
    setLines((p) => p.filter((_, idx) => idx !== i));
  }

  function newTemplate() {
    setTemplateId("");
    setTitle("");
    setLines([{ text: "", required: true }]);
    setTab("templates");
    setMsg(null);
  }

  const cleanedLines = useMemo(() => {
    return lines
      .map((l) => ({ text: l.text.trim(), required: !!l.required }))
      .filter((l) => l.text.length > 0);
  }, [lines]);

  const canSaveTemplate = useMemo(() => {
    return title.trim().length > 0 && cleanedLines.length > 0;
  }, [title, cleanedLines]);

  // -------------------
  // SAVE TEMPLATE
  // -------------------
  async function saveTemplate() {
    if (!canSaveTemplate || busySave) {
      setMsg("Remplis un titre + au moins 1 tâche.");
      return;
    }

    setBusySave(true);
    setMsg(null);

    const urls = [
      "/api/admin/task-templates",
      "/api/admin/templates",
      "/api/task-templates",
      "/api/templates",
    ];

    const payload: any = {
      id: templateId || undefined,
      title: title.trim(),
      items: cleanedLines,
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
        let data: any = null;
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

        const newId =
          data?.template?.id ??
          data?.id ??
          data?.templateId ??
          data?.data?.template?.id ??
          null;

        setMsg("Template enregistré.");
        await reloadTemplates(true);
        if (newId) setTemplateId(String(newId));
        setBusySave(false);
        return;
      } catch (e: any) {
        lastError = `${url} -> fetch failed :: ${e?.message ?? String(e)}`;
      }
    }

    setMsg(`Erreur lors de l'enregistrement. ${lastError}`);
    setBusySave(false);
  }

  // -------------------
  // DELETE TEMPLATE
  // -------------------
  async function deleteTemplate() {
    if (!templateId || busySave) return;

    const sure = window.confirm("Supprimer ce template ?");
    if (!sure) return;

    setBusySave(true);
    setMsg(null);

    const urls = ["/api/templates"];

    let lastError = "";
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "DELETE" });
        const text = await res.text();
        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`;
          continue;
        }
        setMsg("🗑️ Template supprimé.");
        setTemplateId("");
        setTitle("");
        setLines([{ text: "", required: true }]);
        await reloadTemplates(false);
        setBusySave(false);
        return;
      } catch (e: any) {
        lastError = `${url} -> fetch failed :: ${e?.message ?? String(e)}`;
      }
    }

    setMsg(`Delete failed. ${lastError}`);
    setBusySave(false);
  }

  // -------------------
  // ASSIGN
  // -------------------
  async function assignToEmployee() {
    if (busyAssign) return;

    if (!employeeId) {
      setMsg("Choisis un employé.");
      return;
    }
    if (!dateYMD) {
      setMsg("Choisis une date.");
      return;
    }

    if (tab === "templates" && !templateId) {
      setMsg("Choisis un template à assigner.");
      return;
    }

    if (tab === "custom" && (!title.trim() || cleanedLines.length === 0)) {
      setMsg("En custom: titre + au moins 1 tâche.");
      return;
    }

    setBusyAssign(true);
    setMsg(null);

    const payload =
      tab === "templates"
        ? { employeeId, date: dateYMD, templateId }
        : { employeeId, date: dateYMD, title: title.trim(), items: cleanedLines };

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
        setBusyAssign(false);
        return;
      } catch (e: any) {
        lastError = `${url} -> fetch failed :: ${e?.message ?? String(e)}`;
      }
    }

    setMsg(`Assign failed. ${lastError}`);
    setBusyAssign(false);
  }

  // -------------------
  // UI
  // -------------------
  return (
    <div className="ctPage">
      <style jsx global>{`
        select option {
          color: #0b0b10 !important;
          background: #ffffff !important;
        }
      `}</style>

      <div className="ctShell">
        <div className="ctTop">
          <div>
            <h1 className="ctH1">Creation T</h1>
            <p className="ctP">
              Crée des templates de tâches réutilisables, puis assigne-les à un employé planifié pour une date.
            </p>
          </div>

          <div className="ctTopActions">
            <a className="ctBtn" href="/admin/dashboard">
              Retour
            </a>
            <button className="ctBtn" type="button" onClick={() => reloadTemplates(true)} disabled={loadingTemplates}>
              {loadingTemplates ? "..." : "Rafraîchir templates"}
            </button>
            <button className="ctBtn" type="button" onClick={newTemplate}>
              + Nouveau template
            </button>
          </div>
        </div>

        {msg ? <div className="ctMsg">{msg}</div> : null}

        <div className="ctGrid">
          {/* LEFT: ASSIGN */}
          <div className="ctCard">
            <div className="ctCardHead">
              <div>
                <div className="ctCardTitle">Assignation</div>
                <div className="ctMuted">Choisis la date → vois qui travaille → assigne.</div>
              </div>
              <div className="ctPills">
                <button
                  type="button"
                  className={`ctPill ${tab === "templates" ? "on" : ""}`}
                  onClick={() => setTab("templates")}
                >
                  Templates
                </button>
                <button
                  type="button"
                  className={`ctPill ${tab === "custom" ? "on" : ""}`}
                  onClick={() => setTab("custom")}
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="ctCardBody">
              <div className="ctGrid2">
                <div>
                  <label className="ctLabel">Date</label>
                  <input
                    className="ctInput"
                    type="date"
                    value={dateYMD}
                    onChange={(e) => setDateYMD(e.target.value)}
                  />
                  <div className="ctHintSmall">
                    {loadingWorking
                      ? "Chargement des employés planifiés…"
                      : `${workingEmployees.length} employé(s) planifié(s)`}
                  </div>
                </div>

                <div>
                  <label className="ctLabel">Employé (planifié)</label>
                  <select
                    className="ctSelect"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    disabled={loadingWorking}
                  >
                    <option value="">
                      {loadingWorking
                        ? "Chargement..."
                        : workingEmployees.length
                        ? "— Choisir —"
                        : "Aucun employé planifié"}
                    </option>

                    {workingEmployees.map((e) => {
                      const start = new Date(e.startISO).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const end = new Date(e.endISO).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName} • {start}–{end}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="ctGrid2" style={{ marginTop: 10 }}>
                {tab === "templates" ? (
                  <div>
                    <label className="ctLabel">Template</label>
                    <select
                      className="ctSelect"
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      disabled={loadingTemplates}
                    >
                      <option value="">{loadingTemplates ? "Chargement..." : "— Choisir —"}</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="ctLabel">Titre (custom)</label>
                    <input
                      className="ctInput"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Fermeture - Soir"
                    />
                  </div>
                )}
              </div>

              <div className="ctActions">
                <button
                  className="ctBtnPrimary"
                  type="button"
                  onClick={assignToEmployee}
                  disabled={busyAssign || loadingWorking || workingEmployees.length === 0}
                >
                  {busyAssign ? "..." : "Assigner"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: TEMPLATE BUILDER */}
          <div className="ctCard">
            <div className="ctCardHead">
              <div>
                <div className="ctCardTitle">Templates</div>
                <div className="ctMuted">Construis une checklist que tu peux réutiliser.</div>
              </div>
              <div className="ctTopActions">
                <select
                  className="ctSelect"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={loadingTemplates}
                  style={{ maxWidth: 320 }}
                >
                  <option value="">{loadingTemplates ? "Chargement..." : "— Choisir —"}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ctCardBody">
              <label className="ctLabel">Titre</label>
              <input
                className="ctInput"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Ouverture - Matin"
              />

              <div className="ctSplitRow">
                <div className="ctCardTitle" style={{ fontSize: 13 }}>
                  Tâches
                </div>
                <button className="ctTinyBtn" type="button" onClick={addLine}>
                  + Ajouter
                </button>
              </div>

              <div className="ctList">
                {lines.length === 0 ? (
                  <div className="ctEmpty">Aucune tâche.</div>
                ) : (
                  lines.map((l, idx) => (
                    <div className="ctLine" key={idx}>
                      <input
                        className="ctLineInput"
                        value={l.text}
                        onChange={(e) => updateLine(idx, { text: e.target.value })}
                        placeholder={`Tâche ${idx + 1}`}
                      />

                      <label className="ctCheck">
                        <input
                          type="checkbox"
                          checked={l.required}
                          onChange={(e) => updateLine(idx, { required: e.target.checked })}
                        />
                        <span>Requis</span>
                      </label>

                      <button className="ctIconBtn" type="button" onClick={() => removeLine(idx)} aria-label="Remove">
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="ctActions">
                <button className="ctBtnPrimary" type="button" onClick={saveTemplate} disabled={busySave}>
                  {busySave ? "..." : "Créer / Enregistrer"}
                </button>

                <button className="ctBtnDanger" type="button" onClick={deleteTemplate} disabled={busySave || !templateId}>
                  Supprimer
                </button>

                <button
                  className="ctBtn"
                  type="button"
                  onClick={() => {
                    setTab("custom");
                    setTemplateId("");
                    setMsg("Copié vers custom.");
                  }}
                  disabled={lines.length === 0}
                >
                  Dupliquer vers custom
                </button>
              </div>

              <div className="ctFooterTip">
                Si ça ne sauvegarde pas: regarde le message d’erreur. Il contient la route + status + body.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
