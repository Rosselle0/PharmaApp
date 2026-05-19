// src/app/schedule/page.tsx
import "./schedule.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import KioskSidebar from "@/components/KioskSidebar";
import { getKioskEmployeeFromSession } from "@/lib/kioskEmployeeAuth";
import { unpaidBreak30DeductionMinutes } from "@/lib/unpaidBreak30";
import OrderSyncClient from "./OrderSyncClient";
import ScheduleDomOrderSync from "./ScheduleDomOrderSync";
import ScheduleExportLink from "./ScheduleExportLink";
import { ymdInTZ } from "@/lib/shiftChange/time";
import {
  computeEffectiveStartTime,
  computeLatePenaltyMinutes,
  type LateDecision,
} from "@/lib/punch/late";
import { isAutoPunchShift } from "@/lib/punch/shiftNotes";

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

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Hide auto punch rows when a real planned shift exists that day. */
function scheduleShiftsForDisplay(list: ScheduleShiftRow[]) {
  if (list.some((s) => !isAutoPunchShift(s.note))) {
    return list.filter((s) => !isAutoPunchShift(s.note));
  }
  return list;
}

/** One visual row per day: merge punch onto the planned shift, drop duplicate/auto rows. */
function collapseScheduleDayShifts(list: ScheduleShiftRow[]): ScheduleShiftRow[] {
  const rows = scheduleShiftsForDisplay(list);
  if (rows.length <= 1) return rows;

  const manual = rows.filter((s) => !isAutoPunchShift(s.note));
  const pool = manual.length ? manual : rows;
  const primary = [...pool].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
  const punchInAt =
    pool.map((s) => s.punchInAt).find((t): t is Date => t instanceof Date) ?? null;

  if (!punchInAt) return normalizeDayShifts(pool);

  const rawLateMinutes = (punchInAt.getTime() - primary.startTime.getTime()) / 60000;
  const latePenaltyMinutes = computeLatePenaltyMinutes(rawLateMinutes) ?? 0;
  const lateDecision: LateDecision | null =
    latePenaltyMinutes > 0
      ? pool.find((s) => s.lateDecision)?.lateDecision ?? primary.lateDecision ?? "PENDING"
      : null;

  return [
    {
      ...primary,
      punchInAt,
      latePenaltyMinutes,
      lateDecision,
      payableStartTime: computeEffectiveStartTime(primary.startTime, latePenaltyMinutes, lateDecision),
    },
  ];
}

function prepareScheduleDayShifts(list: ScheduleShiftRow[]) {
  return normalizeDayShifts(collapseScheduleDayShifts(list));
}

function scheduleShiftTimeLabels(sh: ScheduleShiftRow) {
  if (sh.punchInAt) {
    return {
      start: hmLocal(new Date(sh.punchInAt)),
      end: hmLocal(new Date(sh.endTime)),
    };
  }
  return {
    start: hmLocal(new Date(sh.startTime)),
    end: hmLocal(new Date(sh.endTime)),
  };
}

type ScheduleShiftRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  note: string | null;
  punchInAt: Date | null;
  latePenaltyMinutes: number;
  lateDecision: LateDecision | null;
  payableStartTime: Date;
};

function normalizeDayShifts<T extends { startTime: Date; endTime: Date; note: string | null }>(rawList: T[]) {
  const byStart = new Map<string, T>();
  for (const sh of rawList) {
    const startKey = hmLocal(new Date(sh.startTime));
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
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?:
  | Promise<{ week?: string; code?: string; section?: string; order?: string }>
  | { week?: string; code?: string; section?: string; order?: string };
}) {
  noStore();
  const sp =
    (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const sectionParam = String(sp.section ?? "CAISSE_LAB").toUpperCase();
  const section: "CAISSE_LAB" | "FLOOR" =
    sectionParam.includes("FLOOR") ? "FLOOR" : "CAISSE_LAB";
  const orderFromQuery = String(sp.order ?? "").trim();
  const cookieStore = await cookies();
  const decodeOrderCookie = (raw: string | undefined) => {
    if (!raw) return "";
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  };
  const orderFromCookieSection = decodeOrderCookie(
    cookieStore.get(`schedule_order_${section}`)?.value
  );
  const orderFromCookieGlobal = decodeOrderCookie(
    cookieStore.get("schedule_order")?.value
  );
  const orderFromCookie = orderFromCookieSection || orderFromCookieGlobal;
  const orderParam = orderFromQuery || orderFromCookie;
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
    select: { id: true, firstName: true, lastName: true, department: true, role: true, paidBreak30: true },
  });

  const viewEmployeesRaw =
    section === "FLOOR"
      ? employees.filter((e) => e.department === "FLOOR")
      : employees.filter((e) => e.department === "CASH" || e.department === "LAB");

  const orderIds = orderParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const employeeById = new Map(viewEmployeesRaw.map((e) => [e.id, e] as const));
  const orderedFromParam = orderIds
    .map((id) => employeeById.get(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const unordered = viewEmployeesRaw.filter((e) => !orderIds.includes(e.id));
  const viewEmployees = [...orderedFromParam, ...unordered];

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

  // Fetch CLOCK_IN punches in the visible window (actual punch times; planned times stay on Shift).
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

  const shiftIds = shifts.map((s) => s.id);
  const lateAuditLogs = shiftIds.length
    ? await prisma.auditLog.findMany({
        where: {
          companyId,
          target: { in: shiftIds },
          action: { in: ["LATE_ACCEPTED", "LATE_REJECTED", "LATE_REVIEWED"] },
        },
        orderBy: { createdAt: "desc" },
        select: { target: true, action: true },
      })
    : [];

  const lateDecisionByShiftId = new Map<string, LateDecision>();
  for (const l of lateAuditLogs) {
    if (lateDecisionByShiftId.has(l.target)) continue;
    if (l.action === "LATE_REJECTED") lateDecisionByShiftId.set(l.target, "REJECTED");
    else if (l.action === "LATE_ACCEPTED" || l.action === "LATE_REVIEWED") {
      lateDecisionByShiftId.set(l.target, "ACCEPTED");
    }
  }

  const punchInAtByShiftId = new Map<string, Date>();

  for (const s of shifts) {
    const startMs = s.startTime.getTime();
    let firstIn = s.id && punchInByShiftId.get(s.id);
    if (!firstIn) {
      const arr = punchInByEmployee.get(s.employeeId) ?? [];
      const toleranceBeforeMs = 2 * 60 * 60 * 1000;
      const toleranceAfterMs = 12 * 60 * 60 * 1000;
      const candidates = arr.filter((at) => {
        const t = at.getTime();
        return t >= startMs - toleranceBeforeMs && t <= startMs + toleranceAfterMs;
      });
      firstIn = candidates.length ? candidates[0] : undefined;
    }
    if (firstIn) punchInAtByShiftId.set(s.id, firstIn);
  }

  const byUserDay = new Map<string, ScheduleShiftRow[]>();

  for (const s of shifts) {
    const key = `${s.employeeId}:${ymdInTZ(new Date(s.startTime))}`;
    const punchInAt = punchInAtByShiftId.get(s.id) ?? null;
    const rawLateMinutes = punchInAt ? (punchInAt.getTime() - s.startTime.getTime()) / 60000 : null;
    const latePenaltyMinutes = punchInAt ? computeLatePenaltyMinutes(rawLateMinutes) ?? 0 : 0;
    const lateDecision: LateDecision | null =
      latePenaltyMinutes > 0 ? lateDecisionByShiftId.get(s.id) ?? "PENDING" : null;
    const payableStartTime = computeEffectiveStartTime(s.startTime, latePenaltyMinutes, lateDecision);

    const arr = byUserDay.get(key) ?? [];
    arr.push({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note ?? null,
      punchInAt,
      latePenaltyMinutes,
      lateDecision,
      payableStartTime,
    });
    byUserDay.set(key, arr);
  }

  const prevWeek = ymdInTZ(addDays(weekStart, -7));
  const nextWeek = ymdInTZ(addDays(weekStart, 7));
  // SECURITY: do not use `?code=` in URLs.
  const codeQS = "";
  const sectionQS = `&section=${encodeURIComponent(section)}`;
  const orderQS = orderParam ? `&order=${encodeURIComponent(orderParam)}` : "";
  const mobileDays = days.map((d, i) => {
    const ymd = ymdInTZ(d);
    const employeesWorking = viewEmployees
      .map((u) => {
        const list = prepareScheduleDayShifts(byUserDay.get(`${u.id}:${ymd}`) ?? []);
        if (list.length === 0) return null;
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          department:
            u.role === "MANAGER" ? "Gérant" : u.department === "CASH" ? "Caisse" : u.department === "LAB" ? "Lab" : "Plancher",
          shifts: list.map((sh) => {
            if (sh.note === "VAC") return "VAC";
            const t = scheduleShiftTimeLabels(sh);
            return `${t.start}–${t.end}`;
          }),
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
      <OrderSyncClient section={section} />
      <ScheduleDomOrderSync section={section} />
      <KioskSidebar
        isPrivilegedLogged={isPrivilegedLogged}
        employeeLogged={employeeLogged}
        employeeCode={employeeCode}
      />

      <main className="scheduleMain page">
        <div className="shell">
          <div className="head">
            <div className="headLeft">
              <h1 className="h1">Horaire</h1>
              <div className="sectionToggles">
                <Link
                  className="btn"
                  href={`/schedule?week=${encodeURIComponent(ymdInTZ(weekStart))}${codeQS}&section=CAISSE_LAB${orderQS}`}
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
                  href={`/schedule?week=${encodeURIComponent(ymdInTZ(weekStart))}${codeQS}&section=FLOOR${orderQS}`}
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

            <div className="headRight">
              <div className="headNav row">
                <Link
                  className="btn"
                  href={`/schedule?week=${encodeURIComponent(prevWeek)}${codeQS}${sectionQS}${orderQS}`}
                >
                  ← Semaine précédente
                </Link>

                <Link
                  className="btn"
                  href={`/schedule?week=${encodeURIComponent(nextWeek)}${codeQS}${sectionQS}${orderQS}`}
                >
                  Semaine suivante →
                </Link>
              </div>
              <ScheduleExportLink
                weekYmd={ymdInTZ(weekStart)}
                section={section}
                className="btn pdfBtn"
              />
            </div>
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
                            <div key={u.id} className="mobileShiftRow" data-emp-id={u.id}>
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
                          <th key={ymdInTZ(d)} className="th">
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
                          const key = `${u.id}:${ymdInTZ(d)}`;
                          const list = prepareScheduleDayShifts(byUserDay.get(key) ?? []);

                          for (const sh of list) {
                            if (sh.note === "VAC") continue;
                            const durationMinutes = Math.floor(
                              (+new Date(sh.endTime) - +new Date(sh.payableStartTime)) / 60000
                            );
                            const deductionMinutes = unpaidBreak30DeductionMinutes(u.paidBreak30, durationMinutes);
                          const payableMinutes = Math.max(0, durationMinutes - deductionMinutes);
                          totalMinutes += roundMinutesToNearestQuarter(payableMinutes);
                          }

                          return (
                            <td key={key} className="td">
                              {list.length === 0 ? (
                                <span className="muted">—</span>
                              ) : (
                                list.map((sh, idx) => {
                                  const times = scheduleShiftTimeLabels(sh);
                                  return (
                                    <div key={sh.id ?? idx} className="shiftPill">
                                      {sh.note === "VAC" ? (
                                        <span>VAC</span>
                                      ) : (
                                        <>
                                          <span className="pillTime">{times.start}</span>
                                          <span className="pillDash">–</span>
                                          <span className="pillTime">{times.end}</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </td>
                          );
                        });

                        return (
                          <tr key={u.id} data-emp-id={u.id}>
                            <td className="td nameCell">
                              {u.firstName} {u.lastName}
                              <div className="muted">
                                {u.role === "MANAGER"
                                  ? "Gérant"
                                  : u.department === "CASH"
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