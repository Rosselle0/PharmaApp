// src/app/schedule/page.tsx
import "./schedule.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymdLocal(d: Date) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hmLocal(d: Date) {
  return d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { companyId: true, role: true },
  });
  if (!me) redirect("/dashboard");

  const sp = await searchParams;
  const base = sp.week ? new Date(sp.week + "T12:00:00") : new Date();
  const weekStart = startOfWeek(base);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const users = await prisma.user.findMany({
    where: { companyId: me.companyId },
    orderBy: [{ department: "asc" }, { name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, department: true },
  });

  // Overlap query (correct)
const shifts = await prisma.shift.findMany({
  where: {
    status: "PLANNED",
    AND: [{ startTime: { lt: weekEnd } }, { endTime: { gt: weekStart } }],
    user: { companyId: me.companyId }, 
  },
  orderBy: [{ startTime: "asc" }],
  select: { userId: true, startTime: true, endTime: true, note: true },
});


  const byUserDay = new Map<
    string,
    { startTime: Date; endTime: Date; note: string | null }[]
  >();

  for (const s of shifts) {
    const key = `${s.userId}:${ymdLocal(new Date(s.startTime))}`;
    const arr = byUserDay.get(key) ?? [];
    arr.push({ startTime: s.startTime, endTime: s.endTime, note: s.note ?? null });
    byUserDay.set(key, arr);
  }

  const hoursFmt = new Intl.NumberFormat("fr-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  function renderSection(title: string, dept: "CASH_LAB" | "FLOOR") {
    const sectionUsers = users.filter((u) => u.department === dept);

    return (
      <section className="section">
        <div className="sectionTop">
          <h2 className="sectionTitle">{title}</h2>
          <div className="meta">
            Semaine du {weekStart.toLocaleDateString("fr-CA")}
          </div>
        </div>

        {sectionUsers.length === 0 ? (
          <div className="empty">Aucun employé dans cette section.</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th nameCell stickyLeft">Employé</th>
                  {days.map((d, i) => (
                    <th key={ymdLocal(d)} className="th">
                      {DAY_LABELS[i]}
                      <br />
                      <span className="muted">
                        {d.toLocaleDateString("fr-CA")}
                      </span>
                    </th>
                  ))}
                  <th className="th">Total</th>
                </tr>
              </thead>

              <tbody>
                {sectionUsers.map((u) => {
                  let totalMinutes = 0;

                  const cells = days.map((d) => {
                    const key = `${u.id}:${ymdLocal(d)}`;
                    const list = byUserDay.get(key) ?? [];

                    for (const sh of list) {
                      // clamp duration
                      const mins = Math.max(
                        0,
                        Math.floor(
                          (+new Date(sh.endTime) - +new Date(sh.startTime)) / 60000
                        )
                      );
                      totalMinutes += mins;
                    }

                    return (
                      <td key={key} className="td cell">
                        {list.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          list.map((sh, idx) => (
                            <div key={idx} className="shiftPill" title={sh.note ?? ""}>
                              <span>{hmLocal(new Date(sh.startTime))}</span>
                              <span>–</span>
                              <span>{hmLocal(new Date(sh.endTime))}</span>
                              {sh.note ? <span className="noteDot">•</span> : null}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  });

                  const totalHours = totalMinutes / 60;

                  return (
                    <tr key={u.id}>
                      <td className="td nameCell stickyLeft">
                        {u.name?.trim() ? u.name : u.email}
                        <div className="muted">{u.email}</div>
                      </td>
                      {cells}
                      <td className="td">
                        <b>{hoursFmt.format(totalHours)} h</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  const prevWeek = ymdLocal(addDays(weekStart, -7));
  const nextWeek = ymdLocal(addDays(weekStart, 7));

  return (
    <main className="page">
      <div className="shell">
        <div className="head">
          <div>
            <h1 className="h1">Horaire</h1>
            <p className="p">
              Deux sections: <b>Caisse/Lab</b> et <b>Plancher</b>.
            </p>
          </div>

          <div className="row">
            <Link className="btn" href={`/schedule?week=${encodeURIComponent(prevWeek)}`}>
              ← Semaine précédente
            </Link>
            <Link className="btn" href={`/schedule?week=${encodeURIComponent(nextWeek)}`}>
              Semaine suivante →
            </Link>
            <Link className="btn" href="/dashboard">Retour</Link>
          </div>
        </div>

        {renderSection("Caisse / Lab", "CASH_LAB")}
        {renderSection("Plancher", "FLOOR")}
      </div>
    </main>
  );
}
