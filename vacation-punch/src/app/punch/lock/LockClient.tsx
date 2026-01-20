"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import "../../login/login.css"; // OR import your punch lock css; adjust path if needed

export default function LockClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPathFromQuery = searchParams.get("next");

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => code.trim().length > 0 && !loading, [code, loading]);

  async function unlock() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/kiosk/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (res.ok) {
        router.replace(nextPathFromQuery || "/punch");
        return;
      }
      setError("Code invalide");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <header className="login-header">
          <div className="login-logo">RP</div>
          <div>
            <h1 className="login-title">Manager code</h1>
            <p className="login-subtitle">Entrez le code pour ouvrir le punch.</p>
          </div>
        </header>

        <div className="login-form">
          <div className="field">
            <label className="label">Code</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="Code"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="alert" role="alert">
              <span className="alert-dot" aria-hidden="true" />
              <p className="alert-text">{error}</p>
            </div>
          )}

          <button className="primary" onClick={unlock} disabled={!canSubmit}>
            {loading ? <span className="spinner" aria-hidden="true" /> : "Unlock"}
          </button>
        </div>
      </section>
    </main>
  );
}
