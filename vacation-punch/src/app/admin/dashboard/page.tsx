"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./admin-dashboard.css";


type Role = "ADMIN" | "MANAGER" | "EMPLOYEE" | "USER" | null;

type Action = {
  title: string;
  desc: string;
  href: string;
  roles: Role[]; // who can see it
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) {
          if (!alive) return;
          setRole(null);
          return;
        }
        const json = await res.json();
        const r = (json?.user?.role ?? null) as Role;
        if (!alive) return;
        setRole(r);
      } catch {
        if (!alive) return;
        setRole(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const actions: Action[] = [
    {
      title: "Modifier compte",
      desc: "Modifier les infos / rôles / statuts.",
      href: "/admin/modify",
      roles: ["ADMIN", "MANAGER"],
    },
    {
      title: "Créer compte",
      desc: "Créer un nouvel employé / utilisateur.",
      href: "/admin/create-account",
      roles: ["ADMIN", "MANAGER"],
    },
    {
      title: "Création tâches",
      desc: "Créer / gérer les tâches.",
      href: "/admin/creation-t",
      roles: ["ADMIN", "MANAGER"],
    },
    {
      title: "Création horaire",
      desc: "Modifier l’horaire (édition).",
      href: "/schedule/edit",
      roles: ["ADMIN", "MANAGER"],
    },
    {
      title: "Logs",
      desc: "Consulter l’historique des actions.",
      href: "/admin/logs",
      roles: ["ADMIN", "MANAGER"],
    },
  ];

  const allowed = useMemo(() => {
    if (!role) return [];
    return actions.filter((a) => a.roles.includes(role));
  }, [role]);

  // Hard gate: if not admin/manager, bounce out
  useEffect(() => {
    if (loading) return;
    if (role !== "ADMIN" && role !== "MANAGER") {
      router.replace("/kiosk");
    }
  }, [loading, role, router]);

  if (loading) {
    return (
      <main className="adminDash">
        <div className="adminDashCard">
          <div className="adminDashTitle">Admin Dashboard</div>
          <div className="adminDashSub">Chargement…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="adminDash">
      <header className="adminDashHeader">
        <div>
          <h1 className="adminDashTitle">Dashboard Admin</h1>
          <p className="adminDashSub">Outils de gestion (rôle: {role})</p>
        </div>

        <button className="adminDashBack" onClick={() => router.push("/kiosk")}>
          Retour Kiosk
        </button>
      </header>

      <section className="adminGrid">
        {allowed.map((a) => (
          <button
            key={a.href}
            className="adminCard"
            type="button"
            onClick={() => router.push(a.href)}
          >
            <div className="adminCardTitle">{a.title}</div>
            <div className="adminCardDesc">{a.desc}</div>
            <div className="adminCardGo">Ouvrir →</div>
          </button>
        ))}
      </section>
    </main>
  );
}
