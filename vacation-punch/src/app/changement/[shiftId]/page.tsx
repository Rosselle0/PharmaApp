import "./../changement.css";
import Link from "next/link";
import { headers } from "next/headers";
import CandidatesClient from "./CandidatesClient";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import KioskSidebar from "@/components/KioskSidebar";

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

  if (!host) {
    throw new Error("Missing host header");
  }

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

async function getSentForShift(shiftId: string, code?: string) {
  const base = await getBaseUrl();
  const url = new URL(`${base}/api/shift-change/requests`);

  url.searchParams.set("scope", "sent");
  url.searchParams.set("shiftId", shiftId);
  if (code) url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) return [];
  return Array.isArray(data.sent) ? data.sent : [];
}

function fmt(dt: string) {
  try {
    const date = new Date(dt);
    if (Number.isNaN(date.getTime())) return "Date invalide";

    return date.toLocaleString("fr-CA", {
      timeZone: "America/Toronto",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Date invalide";
  }
}
export default async function ChangementShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ shiftId: string }> | { shiftId: string };
  searchParams?: Promise<{ code?: string }> | { code?: string };
}) {


  const auth = await requireKioskManagerOrAdmin();
  const isPrivilegedLogged = auth.ok;

  const resolvedParams = params instanceof Promise ? await params : params;
  const resolvedSearchParams =
    searchParams instanceof Promise ? await searchParams : searchParams;

  const shiftId = String(resolvedParams.shiftId);
  const code = String(resolvedSearchParams?.code ?? "").trim();

  const data = await getCandidates(shiftId, code || undefined);
  const sent = await getSentForShift(shiftId, code || undefined);

  const backHref = code
    ? `/changement?code=${encodeURIComponent(code)}`
    : "/changement";

  const dashHref = code
    ? `/kiosk?code=${encodeURIComponent(code)}`
    : "/kiosk";

  const employeeCode = code || null;
  const employeeLogged = !!code;

  if (!data.ok) {
    return (
      <div className="changementScope">
        <KioskSidebar
          isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={employeeCode}
        />

        <main className="chgPage">
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
      </div>
    );
  }

  return (
    <div className="changementScope">
      <KioskSidebar
        isPrivilegedLogged={isPrivilegedLogged}
        employeeLogged={employeeLogged}
        employeeCode={employeeCode}
      />

      <main className="chgPage">
        <div className="shell">
          <header className="head">
            <div>
              <h1 className="h1">Changement de quart</h1>
              <p className="p">
                Quart: <b>{fmt(data.shift.startTime)}</b> →{" "}
                <b>{fmt(data.shift.endTime)}</b> • Département:{" "}
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
                  Personne n’est disponible pour ce quart (disponibilités +
                  horaires + vacances).
                </div>
              </div>
            ) : (
              <CandidatesClient
                shiftId={shiftId}
                code={code || undefined}
                eligible={data.eligible}
                sent={sent}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}