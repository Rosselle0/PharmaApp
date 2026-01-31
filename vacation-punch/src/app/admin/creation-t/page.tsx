"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./creation-t.css";

type Department = "FLOOR" | "CASH_LAB";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: Department;
};

type TaskTemplate = {
  id: string;
  title: string;
  items: { id: string; text: string; required: boolean }[];
  updatedAt: string;
};

type Assignment = {
  id: string;
  employeeId: string;
  dateYMD: string; // YYYY-MM-DD
  startHHMM: string | null;
  endHHMM: string | null;
  source: "TEMPLATE" | "CUSTOM";
  templateId: string | null;
  title: string;
  tasks: { id: string; text: string; done: boolean; required: boolean }[];
};

const DEPT_LABEL: Record<Department, string> = {
  CASH_LAB: "Caisse / Lab",
  FLOOR: "Plancher",
};

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminCreationTPage() {
  const router = useRouter();

  // data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // left: template editor
  const [activeTemplateId, setActiveTemplateId] = useState<string | "NEW">("NEW");
  const [tplTitle, setTplTitle] = useState("");
  const [tplItems, setTplItems] = useState<{ id: string; text: string; required: boolean }[]>([]);
  const [tplMsg, setTplMsg] = useState<string | null>(null);

  // right: assignment
  const [employeeId, setEmployeeId] = useState<string>("");
  const [dateYMD, setDateYMD] = useState<string>(ymdTodayLocal());
  const [startHHMM, setStartHHMM] = useState<string>("");
  const [endHHMM, setEndHHMM] = useState<string>("");
  const [assignMode, setAssignMode] = useState<"TEMPLATE" | "CUSTOM">("TEMPLATE");
  const [customTitle, setCustomTitle] = useState("");
  const [customTasks, setCustomTasks] = useState<{ id: string; text: string; required: boolean }[]>([]);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // simple UI polish
  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) ?? null,
    [templates, activeTemplateId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [empRes, tplRes] = await Promise.all([
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/tasks/templates", { cache: "no-store" }),
        ]);

        const empJson = empRes.ok ? await empRes.json().catch(() => null) : null;
        const tplJson = tplRes.ok ? await tplRes.json().catch(() => null) : null;

        if (cancelled) return;

        setEmployees(empJson?.employees ?? []);
        setTemplates(tplJson?.templates ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // when template selection changes, hydrate editor
  useEffect(() => {
    setTplMsg(null);

    if (activeTemplateId === "NEW") {
      setTplTitle("");
      setTplItems([]);
      return;
    }

    const t = templates.find((x) => x.id === activeTemplateId);
    if (!t) return;

    setTplTitle(t.title);
    setTplItems(t.items.map((it) => ({ ...it })));
  }, [activeTemplateId, templates]);

  function newLineId() {
    return Math.random().toString(16).slice(2);
  }

  function addTplItem() {
    setTplItems((p) => [...p, { id: newLineId(), text: "", required: true }]);
  }

  function addCustomTask() {
    setCustomTasks((p) => [...p, { id: newLineId(), text: "", required: true }]);
  }

  function removeLine(setter: any, id: string) {
    setter((p: any[]) => p.filter((x) => x.id !== id));
  }

  function setLineText(setter: any, id: string, text: string) {
    setter((p: any[]) => p.map((x) => (x.id === id ? { ...x, text } : x)));
  }

  function setLineRequired(setter: any, id: string, required: boolean) {
    setter((p: any[]) => p.map((x) => (x.id === id ? { ...x, required } : x)));
  }

  async function saveTemplate() {
    setTplMsg(null);

    const title = tplTitle.trim();
    const items = tplItems
      .map((x) => ({ ...x, text: x.text.trim() }))
      .filter((x) => x.text.length > 0);

    if (title.length < 2) {
      setTplMsg("Donne un titre (min 2 caractères).");
      return;
    }
    if (items.length === 0) {
      setTplMsg("Ajoute au moins 1 tâche dans le template.");
      return;
    }

    setSaving(true);
    try {
      const method = activeTemplateId === "NEW" ? "POST" : "PUT";
      const url =
        activeTemplateId === "NEW"
          ? "/api/tasks/templates"
          : `/api/tasks/templates/${encodeURIComponent(activeTemplateId)}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, items }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Erreur lors de l'enregistrement.");

      // refresh list
      const listRes = await fetch("/api/tasks/templates", { cache: "no-store" });
      const listJson = await listRes.json().catch(() => null);

      setTemplates(listJson?.templates ?? []);
      setTplMsg(activeTemplateId === "NEW" ? "Template créé ✅" : "Template mis à jour ✅");

      // if created, set selection
      if (activeTemplateId === "NEW" && data?.template?.id) {
        setActiveTemplateId(data.template.id);
      }
    } catch (e: any) {
      setTplMsg(e?.message ?? "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (activeTemplateId === "NEW") return;

    setTplMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/templates/${encodeURIComponent(activeTemplateId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Suppression impossible.");

      setActiveTemplateId("NEW");
      // refresh
      const listRes = await fetch("/api/tasks/templates", { cache: "no-store" });
      const listJson = await listRes.json().catch(() => null);
      setTemplates(listJson?.templates ?? []);
      setTplMsg("Template supprimé ✅");
    } catch (e: any) {
      setTplMsg(e?.message ?? "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  function hydrateAssignFromTemplate(t: TaskTemplate) {
    setCustomTitle(t.title);
    setCustomTasks(t.items.map((x) => ({ id: x.id, text: x.text, required: x.required })));
  }

  async function assignTasks() {
    setAssignMsg(null);

    if (!employeeId) {
      setAssignMsg("Choisis un employé.");
      return;
    }
    if (!dateYMD) {
      setAssignMsg("Choisis une date.");
      return;
    }

    // optional time window validation (only if one is set)
    const st = startHHMM.trim();
    const en = endHHMM.trim();
    const hasTime = st.length > 0 || en.length > 0;
    if (hasTime && (st.length !== 5 || en.length !== 5)) {
      setAssignMsg("Heures invalides. Format HH:MM.");
      return;
    }

    // payload depends on mode
    let payload: any = {
      employeeId,
      dateYMD,
      startHHMM: st || null,
      endHHMM: en || null,
    };

    if (assignMode === "TEMPLATE") {
      if (activeTemplateId === "NEW") {
        setAssignMsg("Sélectionne un template existant (ou crée-le).");
        return;
      }
      payload.source = "TEMPLATE";
      payload.templateId = activeTemplateId;
    } else {
      const title = customTitle.trim();
      const tasks = customTasks
        .map((x) => ({ ...x, text: x.text.trim() }))
        .filter((x) => x.text.length > 0);

      if (title.length < 2) {
        setAssignMsg("Titre custom requis (min 2 caractères).");
        return;
      }
      if (tasks.length === 0) {
        setAssignMsg("Ajoute au moins 1 tâche.");
        return;
      }

      payload.source = "CUSTOM";
      payload.title = title;
      payload.tasks = tasks;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Assignation échouée.");

      setAssignMsg("Assigné ✅");
      // convenience: keep admin in flow
      setTimeout(() => setAssignMsg(null), 1200);
    } catch (e: any) {
      setAssignMsg(e?.message ?? "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  const employeesByDept = useMemo(() => {
    const cashLab = employees.filter((e) => e.department === "CASH_LAB");
    const floor = employees.filter((e) => e.department === "FLOOR");
    return { cashLab, floor };
  }, [employees]);

  return (
    <main className="ctPage">
      <div className="ctShell">
        <div className="ctTop">
          <div>
            <h1 className="ctH1">Création de tâches</h1>
            <p className="ctP">
              Crée des templates réutilisables, puis assigne-les à un employé pour une date (et une plage horaire optionnelle).
            </p>
          </div>

          <div className="ctTopActions">
            <a className="ctBtn" href="/kiosk">← Retour</a>
            <button className="ctBtn" type="button" onClick={() => router.refresh()}>
              Rafraîchir
            </button>
          </div>
        </div>

        {loading ? (
          <div className="ctCard">
            <div className="ctCardBody">Chargement…</div>
          </div>
        ) : (
          <div className="ctGrid">
            {/* LEFT: TEMPLATE BUILDER */}
            <section className="ctCard">
              <div className="ctCardHead">
                <div>
                  <div className="ctCardTitle">Templates</div>
                  <div className="ctMuted">Construis une checklist que tu peux réutiliser.</div>
                </div>

                <select
                  className="ctSelect"
                  value={activeTemplateId}
                  onChange={(e) => setActiveTemplateId(e.target.value as any)}
                >
                  <option value="NEW">+ Nouveau template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ctCardBody">
                <label className="ctLabel">Titre</label>
                <input
                  className="ctInput"
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="Ex: Ouverture (Caisse/Lab)"
                />

                <div className="ctSplitRow">
                  <div className="ctLabel">Tâches</div>
                  <button className="ctTinyBtn" type="button" onClick={addTplItem}>
                    + Ajouter
                  </button>
                </div>

                <div className="ctList">
                  {tplItems.length === 0 ? (
                    <div className="ctEmpty">Aucune tâche. Ajoute-en une.</div>
                  ) : (
                    tplItems.map((it) => (
                      <div key={it.id} className="ctLine">
                        <input
                          className="ctLineInput"
                          value={it.text}
                          onChange={(e) => setLineText(setTplItems, it.id, e.target.value)}
                          placeholder="Ex: Vérifier frigo (température)"
                        />

                        <label className="ctCheck">
                          <input
                            type="checkbox"
                            checked={it.required}
                            onChange={(e) => setLineRequired(setTplItems, it.id, e.target.checked)}
                          />
                          <span>Requis</span>
                        </label>

                        <button
                          className="ctIconBtn"
                          type="button"
                          onClick={() => removeLine(setTplItems, it.id)}
                          aria-label="remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {tplMsg && <div className="ctMsg">{tplMsg}</div>}

                <div className="ctActions">
                  <button className="ctBtnPrimary" type="button" onClick={saveTemplate} disabled={saving}>
                    {saving ? "..." : activeTemplateId === "NEW" ? "Créer" : "Enregistrer"}
                  </button>

                  <button
                    className="ctBtnDanger"
                    type="button"
                    onClick={deleteTemplate}
                    disabled={saving || activeTemplateId === "NEW"}
                    title={activeTemplateId === "NEW" ? "Rien à supprimer" : "Supprimer ce template"}
                  >
                    Supprimer
                  </button>

                  <button
                    className="ctBtn"
                    type="button"
                    onClick={() => {
                      if (activeTemplate) {
                        setAssignMode("CUSTOM");
                        hydrateAssignFromTemplate(activeTemplate);
                        setAssignMsg("Template copié → mode custom ✅");
                        setTimeout(() => setAssignMsg(null), 1200);
                      } else {
                        setAssignMsg("Choisis un template.");
                      }
                    }}
                    disabled={!activeTemplate}
                  >
                    Dupliquer vers custom
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: ASSIGN */}
            <section className="ctCard">
              <div className="ctCardHead">
                <div>
                  <div className="ctCardTitle">Assignation</div>
                  <div className="ctMuted">Assigne un template (rapide) ou des tâches custom (flexible).</div>
                </div>

                <div className="ctPills">
                  <button
                    type="button"
                    className={`ctPill ${assignMode === "TEMPLATE" ? "on" : ""}`}
                    onClick={() => setAssignMode("TEMPLATE")}
                  >
                    Template
                  </button>
                  <button
                    type="button"
                    className={`ctPill ${assignMode === "CUSTOM" ? "on" : ""}`}
                    onClick={() => setAssignMode("CUSTOM")}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="ctCardBody">
                <div className="ctGrid2">
                  <div>
                    <label className="ctLabel">Employé</label>
                    <select className="ctSelect" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                      <option value="">— Choisir —</option>
                      <optgroup label="Caisse / Lab">
                        {employeesByDept.cashLab.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Plancher">
                        {employeesByDept.floor.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="ctLabel">Date</label>
                    <input className="ctInput" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
                  </div>
                </div>

                <div className="ctGrid2">
                  <div>
                    <label className="ctLabel">Début (optionnel)</label>
                    <input className="ctInput" value={startHHMM} onChange={(e) => setStartHHMM(e.target.value)} placeholder="08:00" />
                  </div>
                  <div>
                    <label className="ctLabel">Fin (optionnel)</label>
                    <input className="ctInput" value={endHHMM} onChange={(e) => setEndHHMM(e.target.value)} placeholder="17:00" />
                  </div>
                </div>

                {assignMode === "TEMPLATE" ? (
                  <div className="ctBlock">
                    <div className="ctHint">
                      Template sélectionné:{" "}
                      <b>{activeTemplate?.title ?? "Aucun"}</b>
                    </div>
                    <div className="ctHintSmall">Astuce: tu peux “Dupliquer vers custom” pour modifier une version sans casser le template.</div>
                  </div>
                ) : (
                  <div className="ctBlock">
                    <label className="ctLabel">Titre custom</label>
                    <input className="ctInput" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Ex: Shift du matin" />

                    <div className="ctSplitRow" style={{ marginTop: 10 }}>
                      <div className="ctLabel">Tâches</div>
                      <button className="ctTinyBtn" type="button" onClick={addCustomTask}>
                        + Ajouter
                      </button>
                    </div>

                    <div className="ctList">
                      {customTasks.length === 0 ? (
                        <div className="ctEmpty">Ajoute des tâches, ou duplique un template.</div>
                      ) : (
                        customTasks.map((it) => (
                          <div key={it.id} className="ctLine">
                            <input
                              className="ctLineInput"
                              value={it.text}
                              onChange={(e) => setLineText(setCustomTasks, it.id, e.target.value)}
                              placeholder="Ex: Remplir étagères vitamine C"
                            />

                            <label className="ctCheck">
                              <input
                                type="checkbox"
                                checked={it.required}
                                onChange={(e) => setLineRequired(setCustomTasks, it.id, e.target.checked)}
                              />
                              <span>Requis</span>
                            </label>

                            <button
                              className="ctIconBtn"
                              type="button"
                              onClick={() => removeLine(setCustomTasks, it.id)}
                              aria-label="remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {assignMsg && <div className="ctMsg">{assignMsg}</div>}

                <div className="ctActions">
                  <button className="ctBtnPrimary" type="button" onClick={assignTasks} disabled={saving}>
                    {saving ? "..." : "Assigner"}
                  </button>
                </div>

                <div className="ctFooterTip">
                  Pro: si tu modifies un template, ça ne doit pas réécrire les tâches déjà assignées. (Sinon c’est le chaos.)
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
