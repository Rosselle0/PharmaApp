"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import "./admin-dashboard.css";

type Role = "ADMIN" | "MANAGER";

type Action = {
  title: string;
  desc: string;
  href: string;
  roles: Role[];
};

export default function AdminDashboardClient({ role }: { role: Role }) {
  const router = useRouter();

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

  const allowed = useMemo(() => actions.filter((a) => a.roles.includes(role)), [role]);

  return (
    <main className="adminDash">
      <header className="adminDashHeader">
        <div>
          <h1 className="adminDashTitle">Dashboard Admin</h1>
          <p className="adminDashSub">Outils de gestion (rôle: {role})</p>
        </div>

        <button className="adminDashBack" type="button" onClick={() => router.push("/kiosk")}>
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
