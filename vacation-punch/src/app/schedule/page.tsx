// src/app/schedule/page.tsx
import "./schedule.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  x.setDate(x.getDate() - day); // Sunday start
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
  return d.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Toronto",
  });
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default async function SchedulePage({
  searchParams,
}: {
  // ✅ Next.js: searchParams can be a Promise
  searchParams?: Promise<{ week?: string; code?: string }> | { week?: string; code?: string };
}) {
  // ✅ unwrap safely
  const sp = (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const code = String(sp.code ?? "").trim();

  async function getDefaultCompany() {
    const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
    return (
      (await prisma.company.findFirst({ where: { name: companyName } })) ??
      (await prisma.company.create({ data: { name: companyName } }))
    );
  }

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  let companyId: string;

  if (data?.user) {
    const me = await prisma.user.findUnique({
      where: { authUserId: data.user.id },
      select: { companyId: true, role: true },
    });
    if (!me?.companyId) redirect("/dashboard");

    if (me.role === "ADMIN") {
      const company = await getDefaultCompany();
      companyId = company.id;
    } else {
      companyId = me.companyId;
    }
  } else if (code) {
    const company = await getDefaultCompany();
    companyId = company.id;
  } else {
    redirect("/kiosk");
  }

  const base = sp.week ? new Date(String(sp.week) + "T12:00:00") : new Date();
  const weekStart = startOfWeek(base);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, department: true },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      AND: [{ startTime: { lt: weekEnd } }, { endTime: { gt: weekStart } }],
    },
    orderBy: [{ startTime: "asc" }],
    select: { employeeId: true, startTime: true, endTime: true, note: true },
  });

  const byUserDay = new Map<string, { startTime: Date; endTime: Date; note: string | null }[]>();

  for (const s of shifts) {
    const key = `${s.employeeId}:${ymdLocal(new Date(s.startTime))}`;
    const arr = byUserDay.get(key) ?? [];
    arr.push({ startTime: s.startTime, endTime: s.endTime, note: s.note ?? null });
    byUserDay.set(key, arr);
  }

  const hoursFmt = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const prevWeek = ymdLocal(addDays(weekStart, -7));
  const nextWeek = ymdLocal(addDays(weekStart, 7));
  const codeQS = code ? `&code=${encodeURIComponent(code)}` : "";

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
            <Link className="btn" href={`/schedule?week=${encodeURIComponent(prevWeek)}${codeQS}`}>
              ← Semaine précédente
            </Link>
            <Link className="btn" href={`/schedule?week=${encodeURIComponent(nextWeek)}${codeQS}`}>
              Semaine suivante →
            </Link>
            <Link className="btn" href="/kiosk">
              Retour
            </Link>
          </div>
        </div>

        <section className="section">
          <div className="sectionTop">
            <h2 className="sectionTitle">Horaire</h2>
            <div className="meta">Semaine du {weekStart.toLocaleDateString("fr-CA")}</div>
          </div>

          {employees.length === 0 ? (
            <div className="empty">Aucun employé.</div>
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
                        <span className="muted">{d.toLocaleDateString("fr-CA")}</span>
                      </th>
                    ))}
                    <th className="th">Total</th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((u) => {
                    let totalMinutes = 0;

                    const cells = days.map((d) => {
                      const key = `${u.id}:${ymdLocal(d)}`;
                      const list = byUserDay.get(key) ?? [];

                      for (const sh of list) {
                        totalMinutes += Math.max(
                          0,
                          Math.floor((+new Date(sh.endTime) - +new Date(sh.startTime)) / 60000)
                        );
                      }

                      return (
                        <td key={key} className="td cell">
                          {list.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            list.map((sh, idx) => (
                              <div key={idx} className="shiftPill" title={sh.note ?? ""}>
                                <span className="pillTime">{hmLocal(new Date(sh.startTime))}</span>
                                <span className="pillDash">–</span>
                                <span className="pillTime">{hmLocal(new Date(sh.endTime))}</span>

                                {sh.note ? (
                                  <span className="noteBadge">
                                    <span className="noteBadgeDot" aria-hidden="true">
                                      •
                                    </span>
                                    {sh.note}
                                  </span>
                                ) : null}
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
                          {u.firstName} {u.lastName}
                          <div className="muted">{u.department === "CASH_LAB" ? "Caisse / Lab" : "Plancher"}</div>
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
      </div>
    </main>
  );
}
