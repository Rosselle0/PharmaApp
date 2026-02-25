"use client";

import { useMemo, useState, useTransition } from "react";

type SentReq = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  candidateEmployee: { id: string; firstName: string; lastName: string };
};

export default function CandidatesClient({
  shiftId,
  code,
  eligible,
  sent,
}: {
  shiftId: string;
  code?: string;
  eligible: { id: string; name: string }[];
  sent: SentReq[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // map candidateId -> request
  const sentByCandidate = useMemo(() => {
    const m = new Map<string, SentReq>();
    for (const r of sent) m.set(r.candidateEmployee.id, r);
    return m;
  }, [sent]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send() {
    if (selectedIds.length === 0) {
      setToast("ℹ️ Choisis au moins 1 employé.");
      window.setTimeout(() => setToast(null), 2000);
      return;
    }

    const url = code
      ? `/api/shift-change/requests?code=${encodeURIComponent(code)}`
      : `/api/shift-change/requests`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shiftId,
        candidateEmployeeIds: selectedIds,
        message: message.trim() || null,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      alert(data?.error ?? `Erreur (${res.status})`);
      return;
    }

    const created = Number(data.created ?? 0);

    setToast(
      created > 0
        ? `✅ Demande envoyée à ${created} employé(s).`
        : "ℹ️ Demande déjà envoyée à ces employé(s)."
    );

    setSelectedIds([]);
    setMessage("");

    window.setTimeout(() => setToast(null), 2500);

    // refresh server data (sent list)
    window.location.reload();
  }

  async function cancel(requestId: string) {
    const url = code
      ? `/api/shift-change/requests?code=${encodeURIComponent(code)}`
      : `/api/shift-change/requests`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, action: "cancel" }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      alert(data?.error ?? `Erreur (${res.status})`);
      return;
    }

    setToast("✅ Demande annulée.");
    window.setTimeout(() => setToast(null), 2000);
    window.location.reload();
  }

  function labelForStatus(s: SentReq["status"]) {
    if (s === "ACCEPTED") return "Acceptée";
    if (s === "REJECTED") return "Refusée";
    if (s === "CANCELLED") return "Annulée";
    return "En attente";
  }

  return (
    <>
      {toast && <div className="toastOk">{toast}</div>}

      <div className="grid">
        {eligible.map((c) => {
          const req = sentByCandidate.get(c.id);
          const isPendingReq = req?.status === "PENDING";
          const isDoneReq = !!req && req.status !== "PENDING";
          const checked = selectedIds.includes(c.id);

          return (
            <div key={c.id} className="cardMini">
              <div className="cardMiniLeft">
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                    disabled={isPending || isPendingReq || isDoneReq}
                  />
                  <span className="name">{c.name}</span>
                </label>

                {req ? (
                  <div className="meta">
                    {req.status === "PENDING" ? "Déjà demandé" : `Statut: ${labelForStatus(req.status)}`}
                  </div>
                ) : (
                  <div className="meta">Disponible</div>
                )}
              </div>

              {req?.status === "PENDING" ? (
                <button
                  type="button"
                  className="btn"
                  disabled={isPending}
                  onClick={() => startTransition(() => cancel(req.id))}
                >
                  Annuler
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={isPending || isDoneReq}
                  onClick={() => toggle(c.id)}
                  title={isDoneReq ? "Demande déjà traitée" : "Sélectionner"}
                >
                  {checked ? "Désélectionner" : "Sélectionner"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <input
        placeholder="Message optionnel"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={isPending}
        style={{ width: "100%", marginTop: 10 }}
      />

      <button
        className="btn primary"
        onClick={() => startTransition(send)}
        disabled={isPending || selectedIds.length === 0}
        style={{ marginTop: 10 }}
      >
        {isPending ? "Envoi..." : `Envoyer demande${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
      </button>
    </>
  );
}