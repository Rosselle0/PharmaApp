"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./create-account.css";

type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
type Department = "FLOOR" | "CASH_LAB";

function onlyDigits(v: string, max = 10) {
  return v.replace(/\D/g, "").slice(0, max);
}

export default function CreateAccountPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [department, setDepartment] = useState<Department>("FLOOR");
  const [paid30, setPaid30] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      employeeCode.trim().length >= 4 &&
      !loading
    );
  }, [firstName, lastName, employeeCode, loading]);

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
          employeeCode: employeeCode.trim(),
          role,
          department,
          paidBreak30: paid30,
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
      setRole("EMPLOYEE");
      setDepartment("FLOOR");
      setPaid30(false);
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
          <button className="btn" type="button" onClick={() => router.push("/kiosk")}>
            Back
          </button>
          <button className="btn" type="button" onClick={() => router.push("/admin/modify")}>
            Modifier comptes
          </button>
        </div>
      </header>

      <section className="content">
        <div className="card">
          <div className="cardHead">
            <h1>Création de compte</h1>
            <p>Créer un employé rapidement (MVP).</p>
          </div>

          <div className="grid">
            <div className="field">
              <label>Nom</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ex: Tran" />
            </div>

            <div className="field">
              <label>Prénom</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ex: Vincent" />
            </div>

            <div className="field span2">
              <label>Code employé</label>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(onlyDigits(e.target.value))}
                inputMode="numeric"
                placeholder="Ex: 7931"
              />
              <div className="hint">Chiffres seulement. Min 4.</div>
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
                <option value="CASH_LAB">Caisse / Lab</option>
              </select>
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
