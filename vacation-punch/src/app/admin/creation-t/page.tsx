import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function CreationTPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  // Your /api/me pattern (same as kiosk)
  const meRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/me`, {
    cache: "no-store",
  }).catch(() => null);

  // If you don’t have NEXT_PUBLIC_BASE_URL, use a relative call:
  // const meRes = await fetch("/api/me", { cache: "no-store" });

  if (!meRes || !meRes.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Creation T</h1>
        <p>Erreur: /api/me a échoué.</p>
      </main>
    );
  }

  const me = await meRes.json();
  const role = me?.user?.role;

  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect("/kiosk"); // or wherever your kiosk lives
  }

  return (
    <main style={{ padding: 28 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Creation T</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Page admin dédiée. Ajoute ici tes outils de création/gestion.
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 16,
          background: "rgba(255,255,255,.75)",
          border: "1px solid rgba(20,40,80,.14)",
          boxShadow: "0 10px 28px rgba(9,30,66,.10)",
          maxWidth: 720,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          Section à construire
        </h2>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Exemple: créer des templates d’horaire, des postes, des départements, etc.
        </p>
      </div>
    </main>
  );
}
