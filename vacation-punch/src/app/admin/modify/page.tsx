"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./modify.css";

type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
type Department = "FLOOR" | "CASH_LAB";

type Account = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  role: Role; // your API hardcodes EMPLOYEE if you don't have roles
  department: Department;
  paid30: boolean;
};

function onlyDigits(v: string, max = 10) {
  return v.replace(/\D/g, "").slice(0, max);
}

export default function ModifyAccountsPage() {
  const router = useRouter();

  const [items, setItems] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((a) => {
      const full = `${a.firstName} ${a.lastName}`.toLowerCase();
      return (
        full.includes(s) ||
        a.employeeCode.includes(s) ||
        a.department.toLowerCase().includes(s) ||
        a.role.toLowerCase().includes(s)
      );
    });
  }, [items, q]);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/employees", { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Load failed");
      }

      const data = await res.json();
      const list: Account[] = data.employees ?? [];
      setItems(list);

      setSelectedId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e: any) {
      setItems([]);
      setSelectedId(null);
      setMsg(e?.message ?? "Erreur (API)");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) setDraft({ ...selected });
    else setDraft(null);
  }, [selectedId, items]);

  async function save() {
    if (!draft) return;

    // tiny validation
    if (!draft.firstName.trim() || !draft.lastName.trim() || draft.employeeCode.trim().length < 4) {
      setMsg("Champs invalides.");
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/employees/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          employeeCode: onlyDigits(draft.employeeCode),
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Save failed");
      }

      setMsg("✅ Sauvegardé.");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce compte ?")) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/employees/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Delete failed");
      }
      setMsg("🗑️ Supprimé.");
      setSelectedId(null);
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="m-page">
      <header className="m-topbar">
        <div className="m-topLeft">
          <button className="m-btn" type="button" onClick={() => router.push("/kiosk")}>
            ← Back
          </button>
          <button className="m-btn" type="button" onClick={() => router.push("/admin/create-account")}>
            + Créer compte
          </button>
          <button className="m-btn ghost" type="button" onClick={load} disabled={loading}>
            {loading ? "..." : "Refresh"}
          </button>
        </div>

        <div className="m-topRight">
          <div className="m-searchWrap">
            <input
              className="m-search"
              placeholder="Search: nom, code, dept..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="m-clear" type="button" onClick={() => setQ("")} aria-label="clear">
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HORIZONTAL ACCOUNTS RAIL */}
      <section className="m-railSection">
        <div className="m-railTitle">
          <h1>Comptes</h1>
          <p>{filtered.length} affiché(s)</p>
        </div>

        <div className="m-rail" role="list">
          {filtered.length === 0 ? (
            <div className="m-emptyRail">Aucun compte. (Ou API down.)</div>
          ) : (
            filtered.map((a) => {
              const active = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`m-card ${active ? "active" : ""}`}
                  onClick={() => setSelectedId(a.id)}
                  role="listitem"
                >
                  <div className="m-cardTop">
                    <div className="m-avatar" aria-hidden="true">
                      {(a.firstName?.[0] ?? "E").toUpperCase()}
                      {(a.lastName?.[0] ?? "").toUpperCase()}
                    </div>

                    <div className="m-cardMeta">
                      <div className="m-name">
                        {a.firstName} {a.lastName}
                      </div>
                      <div className="m-sub">
                        Code <b>{a.employeeCode}</b> · {a.department === "CASH_LAB" ? "Caisse/Lab" : "Plancher"}
                      </div>
                    </div>

                    <div className="m-pill">{a.paid30 ? "30 payé" : "30 non"}</div>
                  </div>

                  <div className="m-cardBottom">
                    <span className="m-tag">{a.role}</span>
                    <span className="m-tag soft">{a.department}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* EDIT PANEL */}
      <section className="m-editSection">
        <div className="m-editHead">
          <h2>Modifier</h2>
          {draft && (
            <div className="m-editMini">
              <span className="dot" />
              <span>
                {draft.firstName} {draft.lastName} — <b>{draft.employeeCode}</b>
              </span>
            </div>
          )}
        </div>

        {!draft ? (
          <div className="m-emptyEdit">Choisis un compte dans la barre au-dessus.</div>
        ) : (
          <div className="m-form">
            <div className="m-grid">
              <div className="m-field">
                <label>Nom</label>
                <input
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                />
              </div>

              <div className="m-field">
                <label>Prénom</label>
                <input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                />
              </div>

              <div className="m-field span2">
                <label>Code employé</label>
                <input
                  value={draft.employeeCode}
                  inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, employeeCode: onlyDigits(e.target.value) })}
                />
                <div className="m-hint">Chiffres seulement (min 4).</div>
              </div>

              <div className="m-field">
                <label>Département</label>
                <select
                  value={draft.department}
                  onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
                >
                  <option value="FLOOR">Plancher</option>
                  <option value="CASH_LAB">Caisse / Lab</option>
                </select>
              </div>

              <div className="m-field">
                <label>Rôle</label>
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                  <option value="EMPLOYEE">Employé</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <div className="m-hint">MVP: si tu n’as pas role en DB, ça sert juste à l’UI.</div>
              </div>

              <div className="m-field span2">
                <label className="m-check">
                  <input
                    type="checkbox"
                    checked={draft.paid30}
                    onChange={(e) => setDraft({ ...draft, paid30: e.target.checked })}
                  />
                  30 min payé
                </label>
              </div>
            </div>

            {msg && <div className="m-msg">{msg}</div>}

            <div className="m-actions">
              <button className="m-btn primary" type="button" onClick={save} disabled={loading}>
                {loading ? "..." : "Save"}
              </button>
              <button className="m-btn danger" type="button" onClick={() => remove(draft.id)} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
