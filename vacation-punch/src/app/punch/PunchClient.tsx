"use client";

import { useState, useTransition } from "react";

type State = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

const labels: Record<string, string> = {
  CLOCK_IN: "Entrée",
  BREAK_START: "Pause",
  BREAK_END: "Fin pause",
  LUNCH_START: "Lunch",
  LUNCH_END: "Fin lunch",
  CLOCK_OUT: "Sortie",
};

const byState: Record<State, (keyof typeof labels)[]> = {
  OUT: ["CLOCK_IN"],
  IN: ["BREAK_START", "LUNCH_START", "CLOCK_OUT"],
  ON_BREAK: ["BREAK_END"],
  ON_LUNCH: ["LUNCH_END"],
};

export default function PunchClient({ initialState }: { initialState: State }) {
  const [state, setState] = useState<State>(initialState);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function punch(type: keyof typeof labels) {
    const res = await fetch("/api/punch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setToast(data?.error ?? `Erreur (${res.status})`);
      window.setTimeout(() => setToast(null), 2500);
      return;
    }

    setState(data.state);
    setToast(`✅ ${labels[type]} enregistré`);
    window.setTimeout(() => setToast(null), 2000);
  }

  const actions = byState[state];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {toast && (
        <div className="toastOk">{toast}</div>
      )}

      <div style={{ opacity: 0.75, fontWeight: 700 }}>
        Statut: <span style={{ opacity: 1 }}>{state}</span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {actions.map((t) => (
          <button
            key={t}
            className="btn primary"
            disabled={isPending}
            onClick={() => startTransition(() => punch(t))}
          >
            {labels[t]}
          </button>
        ))}
      </div>
    </div>
  );
}