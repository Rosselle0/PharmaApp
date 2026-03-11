import "./../changement.css";
import Link from "next/link";
import { headers } from "next/headers";
import CandidatesClient from "./CandidatesClient";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import KioskSidebar from "@/components/KioskSidebar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = process.env.APP_TZ || "America/Toronto";

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
    const base = getBaseUrl();
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
  const base = getBaseUrl();
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
  const date = new Date(dt);

  if (Number.isNaN(date.getTime())) {
    return "Date invalide";
  }

  return date.toLocaleString("fr-CA", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}