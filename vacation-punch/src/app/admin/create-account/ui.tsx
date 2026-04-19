"use client";

import { useMemo, useState } from "react";
import type { KioskSecondFactorMode } from "@prisma/client";
import { KIOSK_MODE_OPTIONS_FR } from "@/lib/kioskSecondFactorUi";
import { validateKioskPasswordPolicy } from "@/lib/kioskPasswordPolicy";
import { KioskPasswordRequirementsHint } from "@/components/KioskPasswordRequirementsHint";
import { PasswordRevealField } from "@/components/PasswordRevealField";
import "@/app/admin/admin-kiosk-fields.css";
import "./create-account.css";

type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
type Department = "FLOOR" | "CASH" | "LAB";

function onlyDigits(v: string, max = 10) {
  return v.replace(/\D/g, "").slice(0, max);
}

function emailLooksValid(raw: string) {
  const t = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export default function CreateAccountPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [department, setDepartment] = useState<Department>("FLOOR");
  const [paid30, setPaid30] = useState(false);
  const [kioskMode, setKioskMode] = useState<KioskSecondFactorMode>("EMAIL_OTP");
  const [kioskPw, setKioskPw] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsEmail =
    kioskMode === "EMAIL_OTP" || kioskMode === "EMAIL_AND_PASSWORD";
  const showsPwFields =
    kioskMode === "PASSWORD" || kioskMode === "EMAIL_AND_PASSWORD";

  const canCreate = useMemo(() => {
    if (!firstName.trim() || !lastName.trim() || employeeCode.trim().length < 4 || loading) {
      return false;
    }
    if (needsEmail && !emailLooksValid(email)) return false;
    if (showsPwFields) {
      if (role === "MANAGER" && !kioskPw.trim()) return true;
      return validateKioskPasswordPolicy(kioskPw).ok;
    }
    return true;
  }, [
    firstName,
    lastName,
    employeeCode,
    loading,
    needsEmail,
    showsPwFields,
    email,
    role,
    kioskPw,
    kioskMode,
  ]);

  async function create() {
    if (!canCreate) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
          employeeCode: employeeCode.trim(),
          role,
          department,
          paidBreak30: paid30,
          kioskSecondFactorMode: kioskMode,
          ...(kioskPw.trim() ? { kioskPassword: kioskPw.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Create failed");
      }

      setMsg("Compte créé.");
      setFirstName("");
      setLastName("");
      setEmployeeCode("");
      setEmail("");
      setRole("EMPLOYEE");
      setDepartment("FLOOR");
      setPaid30(false);
      setKioskMode("EMAIL_OTP");
      setKioskPw("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="content">
        <div className="card">
          <div className="cardHead">
            <h1>Création de compte</h1>
            <p>Créer un employé rapidement (MVP).</p>
          </div>

          <div className="grid">
            <div className="field">
              <label>Nom</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ex: Tran" />
            </div>

            <div className="field">
              <label>Prénom</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ex: Vincent" />
            </div>

            <div className="field span2">
              <label>Code employé</label>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(onlyDigits(e.target.value))}
                inputMode="numeric"
                placeholder="Ex: 7931"
              />
              <div className="hint">Chiffres seulement. Utilisé votre code caisse</div>
            </div>

            <div className="field">
              <label>Rôle</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="EMPLOYEE">Employé</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div className="field">
              <label>Département</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                <option value="FLOOR">Plancher</option>
                <option value="CASH">Caisse</option>
                <option value="LAB">Lab</option>
              </select>
            </div>

            <div className="field span2 kiosk-admin-section">
              <div className="kiosk-admin-heading">Connexion kiosque (après le PIN)</div>
              <label>Mode de vérification</label>
              <select value={kioskMode} onChange={(e) => setKioskMode(e.target.value as KioskSecondFactorMode)}>
                {KIOSK_MODE_OPTIONS_FR.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="hint">
                {KIOSK_MODE_OPTIONS_FR.find((o) => o.value === kioskMode)?.hint ?? ""}
              </div>

              {needsEmail ? (
                <>
                  <label className="kiosk-mt labelReq">Courriel</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="personne@pharma.ca"
                    autoComplete="email"
                  />
                  <div className="hint">Requis pour ce mode — le code est envoyé à cette adresse.</div>
                </>
              ) : null}

              {showsPwFields ? (
                <>
                  <div className="labelRow kiosk-mt">
                    <span>
                      Mot de passe kiosque
                      {role === "MANAGER" ? (
                        <span className="hint-inline"> (optionnel — mot de passe par défaut si vide)</span>
                      ) : null}
                    </span>
                    <KioskPasswordRequirementsHint id="create-kiosk-pw-req" />
                  </div>
                  <PasswordRevealField
                    autoComplete="new-password"
                    value={kioskPw}
                    onChange={(e) => setKioskPw(e.target.value)}
                    placeholder={
                      role === "MANAGER"
                        ? "Laisser vide pour utiliser le mot de passe manager par défaut"
                        : "8+ caractères, 1 chiffre, 1 caractère spécial"
                    }
                  />
                </>
              ) : null}
            </div>

            <div className="field span2">
              <label className="check">
                <input type="checkbox" checked={paid30} onChange={(e) => setPaid30(e.target.checked)} />
                30 min payé
              </label>
            </div>

            {msg && <div className="msg span2">{msg}</div>}

            <div className="actions span2">
              <button className="btn primary" type="button" onClick={create} disabled={!canCreate}>
                {loading ? "..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
