"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function PunchLockPage() {
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
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "min(420px, 100%)", padding: 20, border: "1px solid #ffffff22", borderRadius: 16 }}>
        <h1 style={{ margin: 0, marginBottom: 10 }}>Accès Punch</h1>
        <p style={{ marginTop: 0, opacity: 0.7 }}>Entrez le code manager pour déverrouiller.</p>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          placeholder="Code"
          style={{ width: "100%", height: 44, borderRadius: 12, padding: "0 12px" }}
          disabled={loading}
        />

        {error && <p style={{ color: "#ff8080", marginTop: 10 }}>{error}</p>}

        <button
          onClick={unlock}
          disabled={!canSubmit}
          style={{ width: "100%", height: 44, marginTop: 12, borderRadius: 12 }}
        >
          {loading ? "..." : "Déverrouiller"}
        </button>
      </section>
    </main>
  );
}
