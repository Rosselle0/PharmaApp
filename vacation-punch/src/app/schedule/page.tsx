// src/app/schedule/page.tsx
import "./schedule.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import KioskSidebar from "@/components/KioskSidebar";
import { getKioskEmployeeFromSession } from "@/lib/kioskEmployeeAuth";
import { unpaidBreak30DeductionMinutes } from "@/lib/unpaidBreak30";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
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

function roundMinutesToNearestQuarter(mins: number) {
  if (!Number.isFinite(mins)) return 0;
  return Math.max(0, Math.round(mins / 15) * 15);
}

function formatQuarterHours(totalMinutes: number) {
  const quarterMinutes = roundMinutesToNearestQuarter(totalMinutes);
  const whole = Math.floor(quarterMinutes / 60);
  const rem = quarterMinutes % 60;
  const suffix = rem === 0 ? "" : rem === 15 ? ".25" : rem === 30 ? ".5" : ".75";
  return `${whole}${suffix}`;
}

function isAutoPunchShift(note: string | null) {
  return note === "PUNCH_AUTO" || note === "PUNCH_AUTO_UNAVAILABLE";
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function normalizeDayShifts<T extends { effectiveStartTime: Date; endTime: Date; note: string | null }>(rawList: T[]) {
  const byStart = new Map<string, T>();
  for (const sh of rawList) {
    const startKey = hmLocal(new Date(sh.effectiveStartTime));
    const prev = byStart.get(startKey);
    if (!prev) {
      byStart.set(startKey, sh);
      continue;
    }
    const prevAuto = isAutoPunchShift(prev.note);
    const curAuto = isAutoPunchShift(sh.note);
    if (prevAuto !== curAuto) {
      byStart.set(startKey, prevAuto ? sh : prev);
      continue;
    }
    if (new Date(sh.endTime).getTime() > new Date(prev.endTime).getTime()) {
      byStart.set(startKey, sh);
    }
  }
  return Array.from(byStart.values()).sort(
    (a, b) =>
      new Date(a.effectiveStartTime).getTime() - new Date(b.effectiveStartTime).getTime()
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?:
  | Promise<{ week?: string; code?: string; section?: string }>
  | { week?: string; code?: string; section?: string };
}) {
  noStore();
  const sp =
    (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const sectionParam = String(sp.section ?? "CAISSE_LAB").toUpperCase();
  const section: "CAISSE_LAB" | "FLOOR" =
    sectionParam.includes("FLOOR") ? "FLOOR" : "CAISSE_LAB";
  const kioskEmployee = await getKioskEmployeeFromSession();

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
  const auth = await requireKioskManagerOrAdmin();
  const isPrivilegedLogged = auth.ok;

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
  } else if (kioskEmployee) {
    companyId = kioskEmployee.companyId;
  } else {
    redirect("/kiosk");
  }

  const employeeLogged = Boolean(kioskEmployee);
  const employeeCode = kioskEmployee?.employeeCode ?? null;

  const base = sp.week ? new Date(String(sp.week) + "T12:00:00") : new Date();
  const weekStart = startOfWeek(base);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, department: true, paidBreak30: true },
  });

  const viewEmployees =
    section === "FLOOR"
      ? employees.filter((e) => e.department === "FLOOR")
      : employees.filter((e) => e.department === "CASH" || e.department === "LAB");

  const viewEmployeeIds = viewEmployees.map((e) => e.id);

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      employeeId: { in: viewEmployeeIds },
      AND: [{ startTime: { lt: weekEnd } }, { endTime: { gt: weekStart } }],
    },
    orderBy: [{ startTime: "asc" }],
    select: { id: true, employeeId: true, startTime: true, endTime: true, note: true },
  });

  function roundUpToNext15Minutes(mins: number) {
    if (!Number.isFinite(mins) || mins <= 0) return 0;
    return Math.ceil(mins / 15) * 15;
  }

  // Fetch CLOCK_IN punches in the visible window (for late->effective start display).
  const punchWindowStart = new Date(weekStart.getTime() - 48 * 60 * 60 * 1000);
  const punchWindowEnd = new Date(weekEnd.getTime() + 48 * 60 * 60 * 1000);
  const punchIns = await prisma.punchEvent.findMany({
    where: {
      employeeId: { in: viewEmployeeIds },
      type: "CLOCK_IN",
      at: { gte: punchWindowStart, lt: punchWindowEnd },
    },
    orderBy: { at: "asc" },
    select: { employeeId: true, shiftId: true, at: true },
  });

  const punchInByShiftId = new Map<string, Date>();
  const punchInByEmployee = new Map<string, Date[]>();
  for (const p of punchIns) {
    if (p.shiftId && !punchInByShiftId.has(p.shiftId)) punchInByShiftId.set(p.shiftId, p.at);
    const arr = punchInByEmployee.get(p.employeeId) ?? [];
    arr.push(p.at);
    punchInByEmployee.set(p.employeeId, arr);
  }

  const latePenaltyByShiftId = new Map<string, number>();
  const effectiveStartByShiftId = new Map<string, Date>();

  for (const s of shifts) {
    const startMs = s.startTime.getTime();
    let firstIn = s.id && punchInByShiftId.get(s.id);
    if (!firstIn) {
      const arr = punchInByEmployee.get(s.employeeId) ?? [];
      // Late window: allow up to 12h after scheduled start, and 2h before.
      const toleranceBeforeMs = 2 * 60 * 60 * 1000;
      const toleranceAfterMs = 12 * 60 * 60 * 1000;
      const candidates = arr.filter((at) => {
        const t = at.getTime();
        return t >= startMs - toleranceBeforeMs && t <= startMs + toleranceAfterMs;
      });
      firstIn = candidates.length ? candidates[0] : undefined;
    }

    if (!firstIn) continue;

    const rawLateMinutes = (firstIn.getTime() - startMs) / 60000;
    const latePenaltyMinutes = rawLateMinutes <= 5 ? 0 : roundUpToNext15Minutes(rawLateMinutes);
    if (latePenaltyMinutes > 0) {
      latePenaltyByShiftId.set(s.id, latePenaltyMinutes);
      effectiveStartByShiftId.set(s.id, new Date(startMs + latePenaltyMinutes * 60 * 1000));
    } else {
      effectiveStartByShiftId.set(s.id, s.startTime);
    }
  }

  const byUserDay = new Map<
    string,
    { id: string; startTime: Date; effectiveStartTime: Date; endTime: Date; note: string | null }[]
  >();

  for (const s of shifts) {
    const key = `${s.employeeId}:${ymdLocal(new Date(s.startTime))}`;
    const arr = byUserDay.get(key) ?? [];
    arr.push({
      id: s.id,
      startTime: s.startTime,
      effectiveStartTime: effectiveStartByShiftId.get(s.id) ?? s.startTime,
      endTime: s.endTime,
      note: s.note ?? null,
    });
    byUserDay.set(key, arr);
  }

  const prevWeek = ymdLocal(addDays(weekStart, -7));
  const nextWeek = ymdLocal(addDays(weekStart, 7));
  // SECURITY: do not use `?code=` in URLs.
  const codeQS = "";
  const sectionQS = `&section=${encodeURIComponent(section)}`;
  const exportHref = `/api/schedule/export?week=${encodeURIComponent(
    ymdLocal(weekStart)
  )}${sectionQS}`;

  const mobileDays = days.map((d, i) => {
    const ymd = ymdLocal(d);
    const employeesWorking = viewEmployees
      .map((u) => {
        const rawList = byUserDay.get(`${u.id}:${ymd}`) ?? [];
        const list = normalizeDayShifts(rawList);
        if (list.length === 0) return null;
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          department:
            u.department === "CASH" ? "Caisse" : u.department === "LAB" ? "Lab" : "Plancher",
          shifts: list.map((sh) =>
            sh.note === "VAC"
              ? "VAC"
              : `${hmLocal(new Date(sh.effectiveStartTime))}–${hmLocal(new Date(sh.endTime))}`
          ),
        };
      })
      .filter((x): x is { id: string; name: string; department: string; shifts: string[] } => Boolean(x));

    return {
      key: ymd,
      title: `${DAY_LABELS[i]} ${d.toLocaleDateString("fr-CA")}`,
      count: employeesWorking.length,
      employeesWorking,
    };
  });

  return (
    <div className="scheduleScope">
      <KioskSidebar
        isPrivilegedLogged={isPrivilegedLogged}
        employeeLogged={employeeLogged}
        employeeCode={employeeCode}
      />

      <main className="scheduleMain page">
        <div className="shell">
          <div className="head">
            <div className="headTitle">
              <h1 className="h1">Horaire</h1>
              <p className="p">Choisis la section à afficher :</p>
              <div className="sectionToggles">
                <Link
                  className="btn"
                  href={`/schedule?week=${encodeURIComponent(ymdLocal(weekStart))}${codeQS}&section=CAISSE_LAB`}
                  style={
                    section === "CAISSE_LAB"
                      ? {
                          background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                          color: "white",
                          border: "1px solid rgba(37, 99, 235, 0.35)",
                        }
                      : undefined
                  }
                >
                  HORAIRE CAISSE/LAB
                </Link>
                <Link
                  className="btn"
                  href={`/schedule?week=${encodeURIComponent(ymdLocal(weekStart))}${codeQS}&section=FLOOR`}
                  style={
                    section === "FLOOR"
                      ? {
                          background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                          color: "white",
                          border: "1px solid rgba(37, 99, 235, 0.35)",
                        }
                      : undefined
                  }
                >
                  HORAIRE PLANCHER
                </Link>
              </div>
            </div>

            <div className="headNav row">
              <Link
                className="btn"
                href={`/schedule?week=${encodeURIComponent(prevWeek)}${codeQS}${sectionQS}`}
              >
                ← Semaine précédente
              </Link>

              <Link
                className="btn"
                href={`/schedule?week=${encodeURIComponent(nextWeek)}${codeQS}${sectionQS}`}
              >
                Semaine suivante →
              </Link>
            </div>
          </div>

          <div className="pdfRow">
            <a
              href={exportHref}
              className="btn pdfBtn"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
              }}
            >
              ⬇ Télécharger PDF (2 semaines)
            </a>
          </div>

          <section className="section">
            <div className="sectionTop">
              <h2 className="sectionTitle">Horaire</h2>
              <div className="meta">
                Semaine du {weekStart.toLocaleDateString("fr-CA")}
              </div>
            </div>

            {viewEmployees.length === 0 ? (
              <div className="empty">Aucun employé.</div>
            ) : (
              <>
                <div className="mobileSchedule">
                  {mobileDays.map((d) => (
                    <details key={d.key} className="mobileDayCard">
                      <summary className="mobileDaySummary">
                        <span className="mobileDayTitle">{d.title}</span>
                        <span className="mobileDayCount">{d.count} employé(s)</span>
                      </summary>
                      <div className="mobileDayBody">
                        {d.count === 0 ? (
                          <div className="mobileDayEmpty">Aucun employé planifié.</div>
                        ) : (
                          d.employeesWorking.map((u) => (
                            <div key={u.id} className="mobileShiftRow">
                              <div>
                                <div className="mobileName">{u.name}</div>
                                <div className="mobileDept">{u.department}</div>
                              </div>
                              <div className="mobileTimes">{u.shifts.join(" / ")}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  ))}
                </div>

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
                      {viewEmployees.map((u) => {
                        let totalMinutes = 0;

                        const cells = days.map((d) => {
                          const key = `${u.id}:${ymdLocal(d)}`;
                          const rawList = byUserDay.get(key) ?? [];
                          const list = normalizeDayShifts(rawList);

                          for (const sh of list) {
                            if (sh.note === "VAC") continue;
                            const durationMinutes = Math.floor((+new Date(sh.endTime) - +new Date(sh.effectiveStartTime)) / 60000);
                            const deductionMinutes = unpaidBreak30DeductionMinutes(u.paidBreak30, durationMinutes);
                          const payableMinutes = Math.max(0, durationMinutes - deductionMinutes);
                          totalMinutes += roundMinutesToNearestQuarter(payableMinutes);
                          }

                          return (
                            <td key={key} className="td">
                              {list.length === 0 ? (
                                <span className="muted">—</span>
                              ) : (
                                list.map((sh, idx) => (
                                  <div key={idx} className="shiftPill">
                                    {sh.note === "VAC" ? (
                                      <span>VAC</span>
                                    ) : (
                                      <>
                                        <span className="pillTime">
                                          {hmLocal(new Date(sh.effectiveStartTime))}
                                        </span>
                                        <span className="pillDash">–</span>
                                        <span className="pillTime">
                                          {hmLocal(new Date(sh.endTime))}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ))
                              )}
                            </td>
                          );
                        });

                        return (
                          <tr key={u.id}>
                            <td className="td nameCell">
                              {u.firstName} {u.lastName}
                              <div className="muted">
                                {u.department === "CASH"
                                  ? "Caisse"
                                  : u.department === "LAB"
                                    ? "Lab"
                                    : "Plancher"}
                              </div>
                            </td>
                            {cells}
                            <td className="td">
                            <b>{formatQuarterHours(totalMinutes)} h</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}