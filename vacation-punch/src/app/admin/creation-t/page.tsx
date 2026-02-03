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
  employeeCode: string; // exists in payload, but we won't display it
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
  // UI PRIORITY
  // -------------------
  const [templatesVisible, setTemplatesVisible] = useState(false);

  // -------------------
  // ASSIGN UI STATE
  // -------------------
  const [tab, setTab] = useState<"templates" | "custom">("templates");
  const [employeeId, setEmployeeId] = useState("");
  const [dateYMD, setDateYMD] = useState(ymd());
  const [assignTemplateId, setAssignTemplateId] = useState("");

  // notes for the ASSIGNMENT (works for both template + custom)
  const [assignNotes, setAssignNotes] = useState("");

  // custom assignment editor (independent — no bleed)
  const [customTitle, setCustomTitle] = useState("");
  const [customLines, setCustomLines] = useState<TemplateItem[]>([{ text: "", required: true }]);

  // -------------------
  // TEMPLATE EDITOR STATE (right panel only)
  // -------------------
  const [tmplEditId, setTmplEditId] = useState("");
  const [tmplEditTitle, setTmplEditTitle] = useState("");
  const [tmplEditLines, setTmplEditLines] = useState<TemplateItem[]>([{ text: "", required: true }]);

  const [busySave, setBusySave] = useState(false);
  const [busyAssign, setBusyAssign] = useState(false);

  const assignSelectedTemplate = useMemo(
    () => templates.find((t) => t.id === assignTemplateId) ?? null,
    [templates, assignTemplateId]
  );

  const tmplSelected = useMemo(
    () => templates.find((t) => t.id === tmplEditId) ?? null,
    [templates, tmplEditId]
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
          if (employeeId && !list.some((e) => e.id === employeeId)) setEmployeeId("");
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
  }, [dateYMD]);

  // -------------------
  // LOAD TEMPLATES
  // -------------------
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

        // keep selected ids valid
        if (assignTemplateId && !normalized.some((t) => t.id === assignTemplateId)) setAssignTemplateId("");
        if (tmplEditId && !normalized.some((t) => t.id === tmplEditId)) setTmplEditId("");

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
    reloadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------
  // TEMPLATE EDITOR: when choose a template in right panel, load into editor state
  // -------------------
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

  // -------------------
  // HELPERS: CUSTOM LINES
  // -------------------
  function addCustomLine() {
    setCustomLines((p) => [...p, { text: "", required: true }]);
  }
  function updateCustomLine(i: number, patch: Partial<TemplateItem>) {
    setCustomLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeCustomLine(i: number) {
    setCustomLines((p) => p.filter((_, idx) => idx !== i));
  }

  const cleanedCustomLines = useMemo(() => {
    return customLines
      .map((l) => ({ text: l.text.trim(), required: !!l.required }))
      .filter((l) => l.text.length > 0);
  }, [customLines]);

  // -------------------
  // HELPERS: TEMPLATE EDIT LINES (right panel)
  // -------------------
  function addTmplLine() {
    setTmplEditLines((p) => [...p, { text: "", required: true }]);
  }
  function updateTmplLine(i: number, patch: Partial<TemplateItem>) {
    setTmplEditLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeTmplLine(i: number) {
    setTmplEditLines((p) => p.filter((_, idx) => idx !== i));
  }

  const cleanedTmplEditLines = useMemo(() => {
    return tmplEditLines
      .map((l) => ({ text: l.text.trim(), required: !!l.required }))
      .filter((l) => l.text.length > 0);
  }, [tmplEditLines]);

  const canSaveTemplate = useMemo(() => {
    return tmplEditTitle.trim().length > 0 && cleanedTmplEditLines.length > 0;
  }, [tmplEditTitle, cleanedTmplEditLines]);

  // -------------------
  // DUPLICATE TEMPLATE -> CUSTOM (ASSIGN SIDE)
  // -------------------
  function duplicateAssignTemplateToCustom() {
    if (!assignSelectedTemplate) return;

    setTab("custom");
    setCustomTitle(assignSelectedTemplate.title);
    setCustomLines(
      assignSelectedTemplate.items.length
        ? assignSelectedTemplate.items.map((x) => ({ text: x.text, required: x.required }))
        : [{ text: "", required: true }]
    );
    setMsg("Copié vers custom (modifie sans toucher au template).");
  }

  // -------------------
  // SAVE TEMPLATE (RIGHT PANEL)
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
        await reloadTemplates();
        if (newId) setTmplEditId(String(newId));
        setBusySave(false);
        return;
      } catch (e: any) {
        lastError = `${url} -> fetch failed :: ${e?.message ?? String(e)}`;
      }
    }

    setMsg(`Erreur lors de l'enregistrement. ${lastError}`);
    setBusySave(false);
  }

  //Delete
  async function deleteTemplate() {
    if (busySave) return;
    if (!tmplEditId) {
      setMsg("Choisis un template à supprimer.");
      return;
    }

    const sure = window.confirm("Supprimer ce template ? Cette action est irréversible.");
    if (!sure) return;

    setBusySave(true);
    setMsg(null);

    // Try multiple delete endpoints (like your save)
    const urls = [
      "/api/admin/task-templates",
      "/api/admin/templates",
      "/api/task-templates",
      "/api/templates",
    ];

    let lastError = "";
    for (const base of urls) {
      // we send id as query param to avoid guessing your backend body parsing
      const url = `${base}?id=${encodeURIComponent(tmplEditId)}`;

      try {
        const res = await fetch(url, { method: "DELETE" });
        const text = await res.text();

        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`;
          continue;
        }

        // Success: clear editor + refresh list
        setMsg("🗑️ Template supprimé.");
        setTmplEditId("");
        setTmplEditTitle("");
        setTmplEditLines([{ text: "", required: true }]);

        // Also clear assignment selection if it was this template
        if (assignTemplateId === tmplEditId) setAssignTemplateId("");

        await reloadTemplates();
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

    if (!employeeId) return setMsg("Choisis un employé.");
    if (!dateYMD) return setMsg("Choisis une date.");

    if (tab === "templates" && !assignTemplateId) {
      return setMsg("Choisis un template à assigner.");
    }

    if (tab === "custom") {
      const hasTitle = customTitle.trim().length > 0;
      const hasItems = cleanedCustomLines.length > 0;
      const hasNotes = assignNotes.trim().length > 0;

      if (!hasTitle && !hasItems && !hasNotes) {
        return setMsg("En custom: mets au moins un titre, une note, ou une tâche.");
      }
    }

    setBusyAssign(true);
    setMsg(null);

    const payload =
      tab === "templates"
        ? {
          employeeId,
          date: dateYMD,
          templateId: assignTemplateId,
          notes: assignNotes.trim() || null,
        }
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
            <p className="ctP">Assignation d’abord. Gestion des templates seulement si nécessaire.</p>
          </div>

          <div className="ctTopActions">
            <a className="ctBtn" href="/admin/dashboard">
              Retour
            </a>

            <button className="ctBtn" type="button" onClick={reloadTemplates} disabled={loadingTemplates}>
              {loadingTemplates ? "..." : "Rafraîchir templates"}
            </button>

            <button className="ctBtn" type="button" onClick={() => setTemplatesVisible((v) => !v)}>
              {templatesVisible ? "Fermer templates" : "Gérer templates"}
            </button>
          </div>
        </div>

        {msg ? <div className="ctMsg">{msg}</div> : null}

        <div className="ctGrid" style={{ gridTemplateColumns: templatesVisible ? "1fr 1fr" : "1fr" }}>
          {/* LEFT: ASSIGN (PRIORITY) */}
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
                  <input className="ctInput" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
                  <div className="ctHintSmall">
                    {loadingWorking ? "Chargement…" : `${workingEmployees.length} employé(s) planifié(s)`}
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
                      const start = new Date(e.startISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      const end = new Date(e.endISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                      return (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName} • {start}–{end}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* MAIN CONTENT */}
              {tab === "templates" ? (
                <div className="ctBlock" style={{ marginTop: 10 }}>
                  <label className="ctLabel">Template à assigner</label>
                  <select
                    className="ctSelect"
                    value={assignTemplateId}
                    onChange={(e) => setAssignTemplateId(e.target.value)}
                    disabled={loadingTemplates}
                  >
                    <option value="">{loadingTemplates ? "Chargement..." : "— Choisir —"}</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>

                  {/* ✅ YOUR BUTTON IS BACK: only shows when template is selected */}
                  <div className="ctActions" style={{ marginTop: 10 }}>
                    <button
                      className="ctBtn"
                      type="button"
                      onClick={duplicateAssignTemplateToCustom}
                      disabled={!assignSelectedTemplate}
                    >
                      Dupliquer vers custom
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ctBlock" style={{ marginTop: 10 }}>
                  <label className="ctLabel">Titre (custom) — optionnel</label>
                  <input
                    className="ctInput"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Ex: Fermeture - Soir"
                  />

                  <div className="ctSplitRow" style={{ marginTop: 12 }}>
                    <div className="ctCardTitle" style={{ fontSize: 13 }}>
                      Checklist (optionnel)
                    </div>
                    <button className="ctTinyBtn" type="button" onClick={addCustomLine}>
                      + Ajouter
                    </button>
                  </div>

                  <div className="ctList">
                    {customLines.length === 0 ? (
                      <div className="ctEmpty">Aucune tâche.</div>
                    ) : (
                      customLines.map((l, idx) => (
                        <div className="ctLine" key={idx}>
                          <input
                            className="ctLineInput"
                            value={l.text}
                            onChange={(e) => updateCustomLine(idx, { text: e.target.value })}
                            placeholder={`Tâche ${idx + 1}`}
                          />

                          <label className="ctCheck">
                            <input
                              type="checkbox"
                              checked={l.required}
                              onChange={(e) => updateCustomLine(idx, { required: e.target.checked })}
                            />
                            <span>Requis</span>
                          </label>

                          <button className="ctIconBtn" type="button" onClick={() => removeCustomLine(idx)} aria-label="Remove">
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* NOTES FOR BOTH */}
              <div className="ctBlock" style={{ marginTop: 12 }}>
                <label className="ctLabel">Notes (optionnel)</label>
                <textarea
                  className="ctInput"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Ex: Priorité sur la caisse. Vérifie le frigo."
                  style={{ minHeight: 90, resize: "vertical" }}
                />
                <div className="ctHintSmall">Visible par l’employé en bas de ses tâches.</div>
              </div>

              <div className="ctActions" style={{ marginTop: 12 }}>
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

          {/* RIGHT: TEMPLATE MANAGER (OPTIONAL, TOGGLED) */}
          {templatesVisible ? (
            <div className="ctCard">
              <div className="ctCardHead">
                <div>
                  <div className="ctCardTitle">Gestion des templates</div>
                  <div className="ctMuted">Édite / crée des templates (ne touche pas au custom).</div>
                </div>

                <div className="ctTopActions">
                  <select
                    className="ctSelect"
                    value={tmplEditId}
                    onChange={(e) => setTmplEditId(e.target.value)}
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
                    + Nouveau
                  </button>
                </div>
              </div>

              <div className="ctCardBody">
                <label className="ctLabel">Titre</label>
                <input
                  className="ctInput"
                  value={tmplEditTitle}
                  onChange={(e) => setTmplEditTitle(e.target.value)}
                  placeholder="Ex: Ouverture - Matin"
                />

                <div className="ctSplitRow">
                  <div className="ctCardTitle" style={{ fontSize: 13 }}>
                    Tâches
                  </div>
                  <button className="ctTinyBtn" type="button" onClick={addTmplLine}>
                    + Ajouter
                  </button>
                </div>

                <div className="ctList">
                  {tmplEditLines.length === 0 ? (
                    <div className="ctEmpty">Aucune tâche.</div>
                  ) : (
                    tmplEditLines.map((l, idx) => (
                      <div className="ctLine" key={idx}>
                        <input
                          className="ctLineInput"
                          value={l.text}
                          onChange={(e) => updateTmplLine(idx, { text: e.target.value })}
                          placeholder={`Tâche ${idx + 1}`}
                        />

                        <label className="ctCheck">
                          <input
                            type="checkbox"
                            checked={l.required}
                            onChange={(e) => updateTmplLine(idx, { required: e.target.checked })}
                          />
                          <span>Requis</span>
                        </label>

                        <button className="ctIconBtn" type="button" onClick={() => removeTmplLine(idx)} aria-label="Remove">
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

                  <button
                    className="ctBtnDanger"
                    type="button"
                    onClick={deleteTemplate}
                    disabled={busySave || !tmplEditId}
                  >
                    Supprimer
                  </button>
                </div>

                <div className="ctFooterTip">
                  Si tu modifies ici, ça modifie le template (normal). Le custom reste indépendant.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
