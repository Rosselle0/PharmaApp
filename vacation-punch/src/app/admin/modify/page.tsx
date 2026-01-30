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
  role: Role;
  department: Department;
  paid30: boolean;
};

export default function ModifyAccountsPage() {
  const router = useRouter();

  const [items, setItems] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/employees");
      if (!res.ok) throw new Error("Load failed");

      const data = await res.json();
      const list: Account[] = data.employees ?? [];
      setItems(list);
      setSelectedId((prev) => prev ?? (list[0]?.id ?? null));
    } catch (e: any) {
      // fallback so you can see UI even before API exists
      const demo: Account[] = [
        { id: "1", firstName: "Tran", lastName: "Vincent", employeeCode: "7931", role: "EMPLOYEE", department: "FLOOR", paid30: false },
        { id: "2", firstName: "Boss", lastName: "Admin", employeeCode: "1111", role: "ADMIN", department: "CASH_LAB", paid30: true },
      ];
      setItems(demo);
      setSelectedId((prev) => prev ?? demo[0].id);
      setMsg("API pas branchée (demo data).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected) setDraft({ ...selected }); }, [selectedId, items.length]);

  async function save() {
    if (!draft) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/employees/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Save failed");
      setMsg("Saved.");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this account?")) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSelectedId(null);
      await load();
      setMsg("Deleted.");
    } catch (e: any) {
      setMsg(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbarActions">
          <button className="btn" type="button" onClick={() => router.push("/kiosk")}>Back</button>
          <button className="btn" type="button" onClick={() => router.push("/admin/create-account")}>Créer Compte</button>
        </div>
      </header>

      <section className="content">
        <div className="layout">
          {/* LEFT LIST */}
          <aside className="panel">
            <div className="panelHead">
              <h2>Comptes</h2>
              <button className="btn small" type="button" onClick={load} disabled={loading}>Refresh</button>
            </div>

            <div className="list">
              {items.map((a) => {
                const active = a.id === selectedId;
                return (
                  <div key={a.id} className={`row ${active ? "active" : ""}`}>
                    <button className="rowMain" type="button" onClick={() => setSelectedId(a.id)}>
                      <div className="name">{a.firstName} {a.lastName}</div>
                      <div className="sub">
                        Code <b>{a.employeeCode}</b> · {a.role} · {a.department}
                      </div>
                    </button>

                    <div className="rowActions">
                      <button className="iconBtn" type="button" title="Edit" onClick={() => setSelectedId(a.id)}>✏️</button>
                      <button className="iconBtn danger" type="button" title="Delete" onClick={() => remove(a.id)}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* RIGHT EDIT */}
          <section className="panel">
            <div className="panelHead">
              <h2>Modifier</h2>
            </div>

            {!draft ? (
              <div className="empty">Select an account.</div>
            ) : (
              <div className="form">
                <div className="field">
                  <label>Nom</label>
                  <input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} />
                </div>

                <div className="field">
                  <label>Prénom</label>
                  <input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
                </div>

                <div className="field span2">
                  <label>Code</label>
                  <input
                    value={draft.employeeCode}
                    inputMode="numeric"
                    onChange={(e) => setDraft({ ...draft, employeeCode: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  />
                </div>

                <div className="field">
                  <label>Rôle</label>
                  <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                    <option value="EMPLOYEE">Employé</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="field">
                  <label>Département</label>
                  <select value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}>
                    <option value="FLOOR">Plancher</option>
                    <option value="CASH_LAB">Caisse / Lab</option>
                  </select>
                </div>

                <div className="field span2">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.paid30}
                      onChange={(e) => setDraft({ ...draft, paid30: e.target.checked })}
                    />
                    30 min payé
                  </label>
                </div>

                {msg && <div className="msg span2">{msg}</div>}

                <div className="actions span2">
                  <button className="btn primary" type="button" onClick={save} disabled={loading}>Save</button>
                  <button className="btn danger" type="button" onClick={() => remove(draft.id)} disabled={loading}>Delete</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
