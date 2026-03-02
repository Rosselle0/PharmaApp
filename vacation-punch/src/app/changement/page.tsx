import "./changement.css";
import Link from "next/link";
import KioskSidebar from "@/components/KioskSidebar"; // client component
import InboundRequestsClient from "./InBoundRequestClient"; // client component
import { Suspense } from "react";
import { headers } from "next/headers";

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

function normalizeShifts(payload: any): ShiftRow[] {
  const raw = payload?.shifts ?? payload?.data?.shifts ?? payload?.rows ?? payload?.data ?? [];
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
  try { data = text ? JSON.parse(text) : null; } catch { return { ok: false, error: `Réponse non-JSON: ${text.slice(0, 120)}` }; }

  if (!res.ok || !data?.ok) return { ok: false, error: data?.error ?? `Erreur (${res.status})` };
  const shifts = normalizeShifts(data);
  return { ok: true, shifts };
}

async function getInbound(code?: string) {
  const base = await getBaseUrl();
  const url = new URL(`${base}/api/shift-change/requests`);
  if (code) url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) return { ok: false as const, inbound: [], error: data?.error ?? `Erreur (${res.status})` };
  return { ok: true as const, inbound: Array.isArray(data.inbound) ? data.inbound : [], error: "" };
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
  return new Date(dt).toISOString().slice(0, 10);
}

export default async function ChangementIndexPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const code = String(searchParams?.code ?? "").trim();
  const data = await getMyShifts(code || undefined);
  const inboundData = await getInbound(code || undefined);
  const returnHref = code ? `/kiosk?code=${encodeURIComponent(code)}` : "/kiosk";

  const realShifts = data.ok ? data.shifts.filter((s) => !s.note?.toUpperCase().includes("VAC")) : [];
  const grouped = new Map<string, ShiftRow[]>();
  for (const s of realShifts) {
    const key = ymd(s.startTime);
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }
  const days = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // ===== FIX: define these BEFORE using KioskSidebar =====
  const employeeCode = code || null;
  const employeeLogged = !!code;
  const isPrivilegedLogged = false; // adjust logic if needed

  return (
    <div className="kiosk-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <Suspense fallback={<div>Loading menu…</div>}>
        <KioskSidebar
          isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={employeeCode}
        />
      </Suspense>

      <main className="tlPage" style={{ flex: 1, padding: "26px 24px 60px" }}>
        <div className="tlContent">
          <header className="head">
            <div>
              <h1 className="h1">Changement de quart</h1>
              <p className="p">Choisis un jour où tu travailles.</p>
            </div>
          </header>

          {!data.ok && <section className="card"><div className="error">{data.error}</div></section>}

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="listHead">
              <h2 className="h2">Demandes reçues</h2>
              <div className="count">{inboundData.ok ? inboundData.inbound.length : 0}</div>
            </div>
            {!inboundData.ok ? (
              <div className="error">{inboundData.error}</div>
            ) : (
              <InboundRequestsClient initial={inboundData.inbound} code={code || undefined} />
            )}
          </section>

          {days.length === 0 ? (
            <section className="card"><div className="empty">Aucun quart à venir.</div></section>
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
                      <Link className="btn primary" href={href}>Voir candidats</Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}