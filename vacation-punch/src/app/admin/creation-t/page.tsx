"use client";

import { useEffect, useMemo, useState } from "react";

import "./creation-t.css";

type Employee = {
  id: string;
  code?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null; // fallback
};

type TemplateItem = { text: string; required: boolean };
type Template = {
  id: string;
  title: string;
  items: TemplateItem[];
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

function employeeLabel(e: Employee) {
  const full =
    `${normStr(e.firstName).trim()} ${normStr(e.lastName).trim()}`.trim() ||
    normStr(e.name).trim() ||
    "";
  if (full) return e.code ? `${full} (${e.code})` : full;
  return e.code ? `Employé (${e.code})` : "Employé";
}

async function tryGetJson(urls: string[]) {
  let lastErr = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (res.ok) return { ok: true as const, url, data };
      lastErr = `${url} -> ${res.status} ${res.statusText} :: ${text?.slice(0, 300)}`;
    } catch (e: any) {
      lastErr = `fetch/json failed :: ${e?.message ?? String(e)}`;
    }
  }
  return { ok: false as const, error: lastErr };
}

function normalizeEmployees(payload: any): Employee[] {
  const raw =
    payload?.employees ??
    payload?.data?.employees ??
    payload?.rows ??
    payload?.data ??
    payload ??
    [];

  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((r: any) => {
      const id = r?.id ?? r?.e_id ?? r?.employeeId ?? r?.uuid;
      if (!id) return null;

      return {
        id: String(id),
        code: r?.code ?? r?.employeeCode ?? r?.pin ?? r?.kiosk_code ?? r?.e_code ?? null,
        firstName: r?.firstName ?? r?.prenom ?? r?.e_prenom ?? null,
        lastName: r?.lastName ?? r?.nom ?? r?.e_nom ?? null,
        name: r?.name ?? r?.fullName ?? null,
      } as Employee;
    })
    .filter(Boolean) as Employee[];
}

function normalizeTemplates(payload: any): Template[] {
  const raw =
    payload?.templates ??
    payload?.data?.templates ??
    payload?.rows ??
    payload?.data ??
    payload ??
    [];

  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((t: any) => {
      const id = t?.id ?? t?.templateId ?? t?.e_id ?? t?.uuid;
      const title = t?.title ?? t?.name ?? t?.templateTitle ?? "";
      const itemsRaw = t?.items ?? t?.tasks ?? t?.lines ?? t?.templateItems ?? [];
      const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];

      const items = itemsArr
        .map((x: any) => ({
          text: normStr(x?.text ?? x?.label ?? x?.task ?? x?.name),
          required: Boolean(x?.required ?? x?.isRequired ?? x?.req ?? true),
        }))
        .filter((x: any) => x.text.trim().length > 0);

      if (!id || !String(title).trim()) return null;

      return {
        id: String(id),
        title: String(title),
        items,
      } as Template;
    })
    .filter(Boolean) as Template[];
}

export default function CreationTPage() {
  // -------------------
  // DATA
  // -------------------
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

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
  // LOAD EMPLOYEES
  // -------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingEmployees(true);
      setMsg(null);

      const result = await tryGetJson([
        "/api/admin/employees",
        "/api/employees",
        "/api/kiosk/employees",
        "/api/admin/list-employees",
      ]);

      if (cancelled) return;

      if (!result.ok) {
        setEmployees([]);
        setMsg(`Employees load failed: ${result.error}`);
        setLoadingEmployees(false);
        return;
      }

      const normalized = normalizeEmployees(result.data);
      setEmployees(normalized);
      if (normalized.length === 0) {
        setMsg(
          `Employees loaded from ${result.url} but list is EMPTY. Your API response shape is wrong or DB query returns nothing.`
        );
      }
      setLoadingEmployees(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------
  // LOAD TEMPLATES
  // -------------------
  async function reloadTemplates(keepSelection = true) {
    setLoadingTemplates(true);
    setMsg(null);

    const result = await tryGetJson([
      "/api/admin/task-templates",
      "/api/admin/templates",
      "/api/task-templates",
      "/api/templates",
    ]);

    if (!result.ok) {
      setTemplates([]);
      setMsg(`Templates load failed: ${result.error}`);
      setLoadingTemplates(false);
      return;
    }

    const normalized = normalizeTemplates(result.data);
    setTemplates(normalized);

    if (keepSelection && templateId) {
      const exists = normalized.some((t) => t.id === templateId);
      if (!exists) setTemplateId("");
    }

    setLoadingTemplates(false);
  }

  useEffect(() => {
    reloadTemplates(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When picking a template, mirror it into editor (so you can tweak/duplicate)
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

    // We try multiple save endpoints. First that works wins.
    const urls = [
      "/api/admin/task-templates",
      "/api/admin/templates",
      "/api/task-templates",
      "/api/templates",
    ];

    const payload: any = {
      // if your backend supports upsert, it can use this id
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
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) {
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text?.slice(0, 300)}`;
          continue;
        }

        // success — try to keep id if returned
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
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text?.slice(0, 300)}`;
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
          lastError = `${url} -> ${res.status} ${res.statusText} :: ${text?.slice(0, 300)}`;
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
      /* Fix dropdown options being white-on-white */
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
              Crée des templates de tâches réutilisables, puis assigne-les à un employé pour une date. Ou fais du
              custom pour une checklist unique.
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

        <div className="ctGrid">
          {/* LEFT: ASSIGN */}
          <div className="ctCard">
            <div className="ctCardHead">
              <div>
                <div className="ctCardTitle">Assignation</div>
                <div className="ctMuted">Choisis l’employé + la date, puis assigne.</div>
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
              <label className="ctLabel">Employé</label>
              <select
                className="ctSelect"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={loadingEmployees}
              >
                <option value="">{loadingEmployees ? "Chargement..." : "— Choisir —"}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeLabel(e)}
                  </option>
                ))}
              </select>

              <div className="ctGrid2">
                <div>
                  <label className="ctLabel">Date</label>
                  <input className="ctInput" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
                </div>

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

              <div className="ctBlock">
                <div className="ctHint">
                  {tab === "templates" ? (
                    <>
                      Assignation du template sélectionné à la date choisie.
                      <div className="ctHintSmall">Tip: tu peux aussi “Dupliquer vers custom” si tu veux modifier.</div>
                    </>
                  ) : (
                    <>
                      Tu vas assigner une checklist custom (non enregistrée en template) à la date choisie.
                      <div className="ctHintSmall">Tip: clique “Créer/Enregistrer” si tu veux la réutiliser.</div>
                    </>
                  )}
                </div>
              </div>

              <div className="ctActions">
                <button className="ctBtnPrimary" type="button" onClick={assignToEmployee} disabled={busyAssign}>
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

              {msg ? <div className="ctMsg">{msg}</div> : null}
            </div>
          </div>
        </div>

        {/* Big message area if needed */}
        {msg && <div className="ctMsg">{msg}</div>}
      </div>
    </div>

  );

}
