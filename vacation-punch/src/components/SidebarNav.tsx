"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  isAdmin?: boolean;
};

export default function SidebarNav({ isAdmin = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  function go(href: string, forceReload = false) {
    let target = href;

    if (code && !href.includes("code=")) {
      const join = href.includes("?") ? "&" : "?";
      target = `${href}${join}code=${encodeURIComponent(code)}`;
    }

    if (forceReload) {
      window.location.assign(target);
    } else {
      router.push(target);
    }
  }

  return (
    <aside className="kiosk-sidebar">
      <div className="kiosk-navTop">
        <button onClick={() => go("/schedule", true)} className="kiosk-btn active">
          <span>📅</span> Horaire
        </button>

        <button onClick={() => go("/change")} className="kiosk-btn">
          <span>🔁</span> Changement
        </button>

        <button onClick={() => go("/task-list")} className="kiosk-btn">
          <span>📋</span> Liste des tâches
        </button>

        <button onClick={() => go("/vacation")} className="kiosk-btn">
          <span>🌴</span> Vacance / Congé
        </button>
      </div>

      <div className="kiosk-navBottom">
        <button onClick={() => go("/settings")} className="kiosk-btn">
          <span>⚙️</span> Paramètres
        </button>

        {isAdmin && (
          <button onClick={() => go("/logs")} className="kiosk-btn">
            <span>🔒</span> Logs
          </button>
        )}
      </div>
    </aside>
  );
}
