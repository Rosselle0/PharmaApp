import "./../changement.css";
import Link from "next/link";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = {
  id: string;
  name: string;
  department: string;
  role: string;
  availNote: string;
};

type ApiOk = {
  ok: true;
  shift: { id: string; startTime: string; endTime: string; department: string };
  eligible: Candidate[];
};

type ApiErr = { ok: false; error: string };

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}`;
}

async function getCandidates(shiftId: string, code?: string): Promise<ApiOk | ApiErr> {
  try {
    const base = await getBaseUrl();
    const url = new URL(`${base}/api/shift-change/candidates`);
    url.searchParams.set("shiftId", shiftId);
    if (code) url.searchParams.set("code", code);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? `Erreur (${res.status})` };
    }
    return data as ApiOk;
  } catch {
    return { ok: false, error: "Erreur réseau" };
  }
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("fr-CA", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ChangementShiftPage({
  params,
  searchParams,
}: {
  // ✅ Next is telling you params is a Promise in this route
  params: Promise<{ shiftId: string }>;
  searchParams?: Promise<{ code?: string }> | { code?: string };
}) {
  // ✅ unwrap params
  const { shiftId } = await params;

  const sp = (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const code = String(sp.code ?? "").trim();

  const data = await getCandidates(shiftId, code || undefined);

  const backHref = code ? `/changement?code=${encodeURIComponent(code)}` : "/changement";
  const dashHref = code ? `/kiosk?code=${encodeURIComponent(code)}` : "/kiosk";

  if (!data.ok) {
    return (
      <main className="page">
        <div className="shell">
          <header className="head">
            <div>
              <h1 className="h1">Changement de quart</h1>
              <p className="p">Trouver un remplaçant</p>
            </div>
            <Link className="btn" href={backHref}>
              Retour
            </Link>
          </header>

          <section className="card">
            <div className="error">{data.error}</div>
            <Link className="btn" href={dashHref} style={{ marginTop: 12 }}>
              Dashboard
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="head">
          <div>
            <h1 className="h1">Changement de quart</h1>
            <p className="p">
              Quart: <b>{fmt(data.shift.startTime)}</b> → <b>{fmt(data.shift.endTime)}</b> • Département:{" "}
              <b>{data.shift.department}</b>
            </p>
          </div>

          <div className="headActions">
            <Link className="btn" href={backHref}>
              ← Mes quarts
            </Link>
            <Link className="btn" href={dashHref}>
              Dashboard
            </Link>
          </div>
        </header>

        <section className="card">
          <div className="listHead">
            <h2 className="h2">Employés disponibles</h2>
            <div className="count">{data.eligible.length}</div>
          </div>

          {data.eligible.length === 0 ? (
            <div className="emptyBlock">
              <div className="emptyTitle">Aucun candidat</div>
              <div className="muted">
                Personne n’est disponible pour ce quart (disponibilités + horaires + vacances).
              </div>
            </div>
          ) : (
            <div className="grid">
              {data.eligible.map((c) => (
                <div key={c.id} className="cardMini">
                  <div className="cardMiniLeft">
                    <div className="name">{c.name}</div>
                    <div className="meta">
                      {c.department} • {c.role}
                      {c.availNote ? ` • ${c.availNote}` : ""}
                    </div>
                  </div>

                  <button className="btn primary" type="button" disabled title="À brancher plus tard">
                    Envoyer demande
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}