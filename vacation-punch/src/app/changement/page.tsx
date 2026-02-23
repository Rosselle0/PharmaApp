import "./changement.css";
import Link from "next/link";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShiftRow = {
  id: string;
  startTime: string;
  endTime: string;
  status: "PLANNED" | "ON_LEAVE" | "COMPLETED" | "CANCELED";
  note: string | null;
};

type ApiErr = { ok: false; error: string };
type ApiOk = { ok: true; shifts: ShiftRow[] };

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}`;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

/** Accepts lots of shapes and returns ShiftRow[] no matter what */
function normalizeShifts(payload: any): ShiftRow[] {
  // common shapes:
  // { ok:true, shifts:[...] }
  // { ok:true, data:{ shifts:[...] } }
  // { ok:true, rows:[...] }
  // { shifts:[...] }
  const raw =
    payload?.shifts ??
    payload?.data?.shifts ??
    payload?.rows ??
    payload?.data ??
    [];

  return safeArray<any>(raw)
    .map((s) => {
      const id = s?.id;
      const startTime = s?.startTime;
      const endTime = s?.endTime;
      if (!id || !startTime || !endTime) return null;

      return {
        id: String(id),
        startTime: String(startTime),
        endTime: String(endTime),
        status: (s?.status ?? "PLANNED") as ShiftRow["status"],
        note: s?.note == null ? null : String(s.note),
      } as ShiftRow;
    })
    .filter(Boolean) as ShiftRow[];
}

async function getMyShifts(code?: string): Promise<ApiOk | ApiErr> {
  const base = await getBaseUrl();
  const url = new URL(`${base}/api/shift-change/my-shifts`);
  if (code) url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: `Réponse non-JSON: ${text.slice(0, 120)}` };
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? `Erreur (${res.status})` };
  }

  const shifts = normalizeShifts(data);
  return { ok: true, shifts };
}

function fmtDay(dt: string) {
  return new Date(dt).toLocaleDateString("fr-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
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

function ymd(dt: string) {
  // stable day key; good enough for now
  return new Date(dt).toISOString().slice(0, 10);
}

export default async function ChangementIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }> | { code?: string };
}) {
  const sp = (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const code = String(sp.code ?? "").trim();

  const data = await getMyShifts(code || undefined);

  const returnHref = code ? `/kiosk?code=${encodeURIComponent(code)}` : "/kiosk";

  if (!data.ok) {
    return (
      <main className="page">
        <div className="shell">
          <header className="head">
            <div>
              <h1 className="h1">Changement de quart</h1>
              <p className="p">Choisis un jour où tu travailles.</p>
            </div>
            <Link className="btn" href={returnHref}>
              Retour
            </Link>
          </header>

          <section className="card">
            <div className="error">{data.error}</div>
          </section>
        </div>
      </main>
    );
  }

  // ✅ now always an array
  const shifts = data.shifts;

  // ✅ remove VAC only (case-insensitive)
  const realShifts = shifts.filter((s) => !s.note?.toUpperCase().includes("VAC"));

  // group by day
  const grouped = new Map<string, ShiftRow[]>();
  for (const s of realShifts) {
    const key = ymd(s.startTime);
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }

  const days = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="page">
      <div className="shell">
        <header className="head">
          <div>
            <h1 className="h1">Changement de quart</h1>
            <p className="p">Choisis un jour où tu travailles.</p>
          </div>

          <Link className="btn" href={returnHref}>
            Retour
          </Link>
        </header>

        {days.length === 0 ? (
          <section className="card">
            <div className="empty">Aucun quart à venir.</div>
          </section>
        ) : (
          <section className="card">
            <div className="list">
              {days.map(([dayKey, dayShifts]) => {
                const sorted = [...dayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
                const first = sorted[0];

                const href = code
                  ? `/changement/${encodeURIComponent(first.id)}?code=${encodeURIComponent(code)}`
                  : `/changement/${encodeURIComponent(first.id)}`;

                return (
                  <div key={dayKey} className="row">
                    <div className="rowMain">
                      <div className="rowTitle">{fmtDay(first.startTime)}</div>

                      <div className="muted">
                        {sorted.map((s) => (
                          <div key={s.id}>
                            {fmtTime(s.startTime)} — {fmtTime(s.endTime)}
                            {s.note && !s.note.toUpperCase().includes("VAC") ? ` • ${s.note}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Link className="btn primary" href={href}>
                      Voir candidats
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}