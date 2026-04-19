"use client";

import { useEffect, useMemo, useState } from "react";
import type { KioskSecondFactorMode } from "@prisma/client";
import { KIOSK_MODE_OPTIONS_FR } from "@/lib/kioskSecondFactorUi";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";
import { KioskPasswordRequirementsHint } from "@/components/KioskPasswordRequirementsHint";
import { PasswordRevealField } from "@/components/PasswordRevealField";
import "@/app/admin/admin-kiosk-fields.css";
import "./modify.css";

type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
type Department = "FLOOR" | "CASH" | "LAB";

type Account = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  employeeCode: string;
  role: Role; // your API hardcodes EMPLOYEE if you don't have roles
  department: Department;
  paid30: boolean;
  kioskSecondFactorMode: KioskSecondFactorMode;
  hasKioskPassword: boolean;
};

function onlyDigits(v: string, max = 10) {
  return v.replace(/\D/g, "").slice(0, max);
}

export default function ModifyAccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kioskPw, setKioskPw] = useState("");

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
      const list: Account[] = (data.employees ?? []).map((e: Account) => ({
        ...e,
        kioskSecondFactorMode: e.kioskSecondFactorMode ?? "EMAIL_OTP",
        hasKioskPassword: Boolean(e.hasKioskPassword),
      }));
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
    setKioskPw("");
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

    if (kioskPw.trim()) {
      const pv = validateKioskPasswordPolicy(kioskPw.trim());
      if (!pv.ok) {
        setMsg(pv.error);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch(`/api/admin/employees/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          employeeCode: onlyDigits(draft.employeeCode),
          department: draft.department,
          role: draft.role,
          paid30: draft.paid30,
          kioskSecondFactorMode: draft.kioskSecondFactorMode,
          ...(kioskPw.trim() ? { kioskPassword: kioskPw.trim() } : {}),
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
                        Code <b>{a.employeeCode}</b> ·{" "}
                        {a.department === "CASH"
                          ? "Caisse"
                          : a.department === "LAB"
                            ? "Lab"
                            : "Plancher"}
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
                <label>Prénom</label>
                <input
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                />
              </div>

              <div className="m-field">
                <label>Nom</label>
                <input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                />
              </div>

              <div className="m-field span2">
                <label className={draft.kioskSecondFactorMode === "EMAIL_OTP" || draft.kioskSecondFactorMode === "EMAIL_AND_PASSWORD" ? "labelReq" : undefined}>
                  Courriel
                  {draft.kioskSecondFactorMode !== "EMAIL_OTP" &&
                  draft.kioskSecondFactorMode !== "EMAIL_AND_PASSWORD" ? (
                    <span className="m-hint" style={{ display: "inline", marginLeft: 6, fontWeight: 600 }}>
                      (optionnel)
                    </span>
                  ) : null}
                </label>
                <input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="personne@pharma.ca"
                />
              </div>

              <div className="m-field span2">
                <label>Code employé</label>
                <input
                  value={draft.employeeCode}
                  inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, employeeCode: onlyDigits(e.target.value) })}
                />
                <div className="m-hint">Chiffres seulement.</div>
              </div>

              <div className="m-field">
                <label>Département</label>
                <select
                  value={draft.department}
                  onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
                >
                  <option value="FLOOR">Plancher</option>
                  <option value="CASH">Caisse</option>
                  <option value="LAB">Lab</option>
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

              <div className="m-field span2 m-kioskBlock">
                <div className="m-kioskTitle">Connexion kiosque (après le PIN)</div>
                <label>Mode de vérification</label>
                <select
                  value={draft.kioskSecondFactorMode}
                  onChange={(e) =>
                    setDraft({ ...draft, kioskSecondFactorMode: e.target.value as KioskSecondFactorMode })
                  }
                >
                  {KIOSK_MODE_OPTIONS_FR.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="m-hint">
                  {KIOSK_MODE_OPTIONS_FR.find((o) => o.value === draft.kioskSecondFactorMode)?.hint ?? ""}
                </div>
                {!draft.email?.trim() &&
                (draft.kioskSecondFactorMode === "EMAIL_OTP" ||
                  draft.kioskSecondFactorMode === "EMAIL_AND_PASSWORD") ? (
                  <div className="m-hint" style={{ color: "#b45309", marginTop: 6 }}>
                    Ajoute un courriel ci-dessus pour ce mode, ou passe au mode « Mot de passe » seul.
                  </div>
                ) : null}

                {(draft.kioskSecondFactorMode === "PASSWORD" ||
                  draft.kioskSecondFactorMode === "EMAIL_AND_PASSWORD") && (
                  <>
                    <div className="labelRow" style={{ marginTop: 12 }}>
                      <label style={{ margin: 0 }}>Mot de passe kiosque</label>
                      <KioskPasswordRequirementsHint id={`edit-kiosk-pw-${draft.id}`} />
                    </div>
                    <PasswordRevealField
                      autoComplete="new-password"
                      value={kioskPw}
                      onChange={(e) => setKioskPw(e.target.value)}
                      placeholder={
                        draft.hasKioskPassword
                          ? "Nouveau mot de passe — vide = inchangé"
                          : "8+ caractères, 1 chiffre, 1 caractère spécial"
                      }
                    />
                    {draft.hasKioskPassword ? (
                      <div className="m-hint">Un mot de passe est déjà enregistré pour ce compte.</div>
                    ) : (
                      <div className="m-hint">Requis pour les modes basés sur le mot de passe.</div>
                    )}
                  </>
                )}
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
