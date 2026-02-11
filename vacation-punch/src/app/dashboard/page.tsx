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
          <h1>Dashboard</h1>
          <p>
            Welcome back, <strong>{data.user.email}</strong>
          </p>
        </div>

        <div className="header-right">
            <span className="role-pill">{me.role}</span>

          <form action={signOut}>
            <button className="signout-btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="card disabled">
          <div className="card-icon">⏱</div>
          <h2>Punch</h2>
          <p>Clock in, clock out, track your working time.</p>
          <span className="coming">Coming soon</span>
        </div>


        <a href="/vacation" className="card">
          <div className="card-icon">🌴</div>
          <h2>Vacation</h2>
          <p>Request vacation and follow approval status.</p>
        </a>

        <Link href="/punch" className="card">
            <div className="card-icon">📅</div>
            <h2>Schedule</h2>
            <p>View assigned shifts and upcoming workdays.</p>
        </Link>

        <Link href="/settings" className="card">
            <div className="card-icon">⚙️</div>
            <h2>Settings</h2>
            <p>Manage your account settings and preferences.</p>
        </Link>
        

        <div className="card disabled">
          <div className="card-icon">👤</div>
          <h2>Profile</h2>
          <p>Manage your account and preferences.</p>
          <span className="coming">Coming soon</span>
        </div>
      </section>
    </main>
  );
}