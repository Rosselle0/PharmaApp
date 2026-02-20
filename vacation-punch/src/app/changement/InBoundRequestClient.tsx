"use client";

import { useMemo, useState, useTransition } from "react";

type InboundReq = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  message: string | null;
  createdAt: string;
  shift: { id: string; startTime: string; endTime: string };
  requesterEmployee: {
    firstName: string;
    lastName: string;
    department: string;
    role: string;
  };
};

function fmtDay(dt: string) {
  return new Date(dt).toLocaleDateString("fr-CA", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtTime(dt: string) {
  return new Date(dt).toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function InboundRequestsClient({
  initial,
  code,
}: {
  initial: InboundReq[];
  code?: string;
}) {
  const [items, setItems] = useState<InboundReq[]>(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => items.filter((x) => x.status === "PENDING"), [items]);

  async function act(requestId: string, action: "accept" | "reject") {
    setPendingId(requestId);

    try {
      const url = code ? `/api/shift-change/requests?code=${encodeURIComponent(code)}` : `/api/shift-change/requests`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        alert(data?.error ?? `Erreur (${res.status})`);
        return;
      }

      setItems((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: action === "accept" ? "ACCEPTED" : "REJECTED" }
            : r
        )
      );
    } finally {
      setPendingId(null);
    }
  }

  // If you want to keep accepted/rejected visible, render items instead of visible.
  if (visible.length === 0) {
    return (
      <div className="emptyBlock">
        <div className="emptyTitle">Aucune demande en attente</div>
        <div className="muted">Tu as peut-être déjà répondu à tout.</div>
      </div>
    );
  }

  return (
    <div className="grid">
      {visible.map((r) => {
        const who = `${r.requesterEmployee.firstName} ${r.requesterEmployee.lastName}`;
        const when = `${fmtDay(r.shift.startTime)} • ${fmtTime(r.shift.startTime)}–${fmtTime(r.shift.endTime)}`;
        const meta = `${r.requesterEmployee.department} • ${r.requesterEmployee.role}`;

        const disabled = isPending && pendingId === r.id;

        return (
          <div key={r.id} className="cardMini">
            <div className="cardMiniLeft">
              <div className="name">{who}</div>
              <div className="meta">
                {when} • {meta}
                {r.message ? ` • ${r.message}` : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={disabled}
                onClick={() => startTransition(() => act(r.id, "reject"))}
              >
                Refuser
              </button>

              <button
                className="btn primary"
                type="button"
                disabled={disabled}
                onClick={() => startTransition(() => act(r.id, "accept"))}
              >
                Accepter
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}