// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import "./dashboard.css";
import { prisma } from "@/lib/prisma";


export default async function Dashboard() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  const me = await prisma.user.findUnique({
  where: { authUserId: data.user.id },
  select: { role: true },
});

if (!me) redirect("/login");

  async function signOut() {
    "use server";
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    redirect("/login");
  }
 return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Tableau de bord</h1>
          <p>
            Bon retour, <strong>{data.user.email}</strong>
          </p>
        </div>

        <div className="header-right">
            <span className="role-pill">{me.role}</span>

          <form action={signOut}>
            <button className="signout-btn" type="submit">
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="card disabled">
          <div className="card-icon">⏱</div>
          <h2>Pointages</h2>
          <p>Entrée, sortie et suivi du temps de travail.</p>
          <span className="coming">Bientôt disponible</span>
        </div>


        <a href="/vacation" className="card">
          <div className="card-icon">🌴</div>
          <h2>Vacances</h2>
          <p>Demandez des vacances et suivez leur statut d’approbation.</p>
        </a>

        <Link href="/punch" className="card">
            <div className="card-icon">📅</div>
            <h2>Horaire</h2>
            <p>Voir vos quarts assignés et les prochains jours de travail.</p>
        </Link>

        <Link href="/settings" className="card">
            <div className="card-icon">⚙️</div>
            <h2>Paramètres</h2>
            <p>Gérer vos paramètres de compte et vos préférences.</p>
        </Link>
        

        <div className="card disabled">
          <div className="card-icon">👤</div>
          <h2>Profil</h2>
          <p>Gérer votre compte et vos préférences.</p>
          <span className="coming">Bientôt disponible</span>
        </div>
      </section>
    </main>
  );
}