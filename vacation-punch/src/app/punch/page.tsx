import "./../changement.css";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";
import PunchClient from "./PunchClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type State = "OUT" | "IN" | "ON_BREAK" | "ON_LUNCH";

function computeState(lastType: string | null): State {
  switch (lastType) {
    case "CLOCK_IN":
    case "BREAK_END":
    case "LUNCH_END":
      return "IN";
    case "BREAK_START":
      return "ON_BREAK";
    case "LUNCH_START":
      return "ON_LUNCH";
    default:
      return "OUT";
  }
}

export default async function PunchPage() {
  // NOTE: requireEmployeeFromKioskOrCode needs Request normally.
  // If your auth helper can’t run here, you should make a /api/me endpoint or use your kiosk session guard.
  // For now, keep this page behind your existing kiosk auth pattern.

  return (
    <main className="page">
      <div className="shell">
        <header className="head">
          <div>
            <h1 className="h1">Pointage</h1>
            <p className="p">Enregistre ton entrée/sortie et tes pauses.</p>
          </div>
          <Link className="btn" href="/kiosk">
            Retour
          </Link>
        </header>

        <section className="card">
          <PunchClient initialState={"OUT"} />
        </section>
      </div>
    </main>
  );
}