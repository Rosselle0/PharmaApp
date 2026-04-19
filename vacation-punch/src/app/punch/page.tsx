import Link from "next/link";
import PunchClient from "./PunchClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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