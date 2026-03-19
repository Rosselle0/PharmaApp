"use client";

import { useState } from "react";
import Link from "next/link";

export default function TerminalLoginPage() {
  const [terminalSecret, setTerminalSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const secret = terminalSecret.trim();
    if (!secret) {
      setError("Code terminal requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/kiosk/terminal-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalSecret: secret }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setError(t || "Code terminal invalide.");
        return;
      }

      // Cookie is httpOnly; just reload a protected page.
      window.location.href = "/kiosk/punch";
    } catch (e: any) {
      setError(e?.message ?? "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Connexion terminal</h1>
      <p>Entrez le code du terminal pour autoriser le poste à faire des pointages.</p>

      <div style={{ marginTop: 14, maxWidth: 520 }}>
        <label style={{ display: "block", fontWeight: 800, marginBottom: 8 }}>Code terminal</label>
        <input
          value={terminalSecret}
          onChange={(e) => setTerminalSecret(e.target.value)}
          placeholder="Ex: ABCD1234..."
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            color: "#111",
          }}
          disabled={loading}
        />

        {error && (
          <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 800 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "rgb(37, 99, 235)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "..." : "Se connecter"}
          </button>
          <Link href="/kiosk">Retour</Link>
        </div>
      </div>
    </main>
  );
}

