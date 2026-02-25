import { requireTerminal } from "@/lib/kioskTerminalAuth";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PunchPage() {
  const term = await requireTerminal();

  if (!term.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Punch</h1>
        <p>Cette page est disponible uniquement sur le poste de travail.</p>
        <Link href="/kiosk">Retour</Link>
      </main>
    );
  }

  return (
    <main>
      {/* put your punch keypad UI here */}
      <div style={{ padding: 24 }}>
        <h1>Punch (poste autorisé)</h1>
        {/* reuse your existing PIN keypad component */}
      </div>
    </main>
  );
}