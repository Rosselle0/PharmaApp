import "./vacation.css";
import { prisma } from "@/lib/prisma";
import { enterEmployeeCode, cancelPendingRequest } from "./actions";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import VacationFormClient from "./VacationFormClient";
import KioskSidebar from "@/components/KioskSidebar";
import { getKioskEmployeeFromSession } from "@/lib/kioskEmployeeAuth";

function statusLabel(status: unknown) {
  const s = String(status ?? "");
  switch (s) {
    case "PENDING":
      return "En attente";
    case "APPROVED":
      return "Approuvé";
    case "REJECTED":
      return "Rejeté";
    case "CANCELLED":
      return "Annulé";
    default:
      return s;
  }
}

function statusIcon(status: unknown) {
  const s = String(status ?? "");
  switch (s) {
    case "PENDING":
      return "⏳";
    case "APPROVED":
      return "✓";
    case "REJECTED":
      return "✕";
    case "CANCELLED":
      return "—";
    default:
      return "•";
  }
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function fmtFull(d: Date) {
  return d.toLocaleDateString("fr-CA");
}

function dayCount(start: Date, end: Date) {
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}

export default async function VacationPage({
  searchParams,
}: {
  searchParams?:
  | Promise<{ code?: string; theme?: "light" | "dark" }>
  | { code?: string; theme?: "light" | "dark" };
}) {
  const sp =
    (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};

  const code = String(sp.code ?? "").trim();
  const theme =
    sp.theme === "dark" || sp.theme === "light" ? (sp.theme as "dark" | "light") : undefined;

  const kioskEmployee = await getKioskEmployeeFromSession();

  const employee =
    kioskEmployee
      ? {
          id: kioskEmployee.id,
          firstName: kioskEmployee.firstName,
          lastName: kioskEmployee.lastName,
          employeeCode: kioskEmployee.employeeCode,
          isActive: kioskEmployee.isActive,
        }
      : code
        ? await prisma.employee.findUnique({
            where: { employeeCode: code },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              isActive: true,
            },
          })
        : null;

  const requests = employee
    ? await prisma.vacationRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
    })
    : [];

  const employeeLogged = !!employee && employee.isActive;

  const employeeCode =
    employee?.employeeCode ??
    (code ? code : null);
  const auth = await requireKioskManagerOrAdmin();
  const isPrivilegedLogged = auth.ok;

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="vacationScope" data-theme={theme}>
      <div className="kiosk-layout">
        <KioskSidebar
          isPrivilegedLogged={isPrivilegedLogged}
          employeeLogged={employeeLogged}
          employeeCode={employeeCode}
        />

        <div className="kiosk-content">
          <div className="shell">

            {!employee || !employee.isActive ? (
              <>
                <div className="vacHero">
                  <div className="vacHeroIcon">🏖</div>
                  <h1 className="vacHeroTitle">Vacances</h1>
                  <p className="vacHeroSub">Identifiez-vous pour soumettre une demande</p>
                </div>

                <section className="vacCard vacCardLogin">
                  <form className="vacLoginForm" action={enterEmployeeCode}>
                    <label className="vacFieldLabel">Code employé</label>
                    <div className="vacLoginRow">
                      <input
                        className="vacInput vacLoginInput"
                        name="employeeCode"
                        placeholder="Entrez votre code"
                        required
                        autoFocus
                      />
                      <button className="vacBtn vacBtnPrimary" type="submit">
                        Continuer
                      </button>
                    </div>
                    {code ? (
                      <div className="vacLoginError">Code invalide ou employé inactif.</div>
                    ) : null}
                  </form>
                </section>
              </>
            ) : (
              <>
                <div className="vacHero">
                  <h1 className="vacHeroTitle">Vacances</h1>
                  <p className="vacHeroSub">{employee.firstName} {employee.lastName}</p>
                </div>

                {requests.length > 0 && (
                  <div className="vacStats">
                    <div className="vacStat">
                      <div className="vacStatValue">{requests.length}</div>
                      <div className="vacStatLabel">Demandes</div>
                    </div>
                    <div className="vacStat vacStatPending">
                      <div className="vacStatValue">{pendingCount}</div>
                      <div className="vacStatLabel">En attente</div>
                    </div>
                    <div className="vacStat vacStatApproved">
                      <div className="vacStatValue">{approvedCount}</div>
                      <div className="vacStatLabel">Approuvées</div>
                    </div>
                  </div>
                )}

                <VacationFormClient
                  employeeCode={employee.employeeCode}
                  employeeName={`${employee.firstName} ${employee.lastName}`}
                />

                <section className="vacCard">
                  <div className="vacCardHead">
                    <h2 className="vacCardTitle">Mes demandes</h2>
                    <span className="vacCardCount">{requests.length}</span>
                  </div>

                  {requests.length === 0 ? (
                    <div className="vacEmpty">
                      <div className="vacEmptyIcon">📋</div>
                      <div>Aucune demande pour le moment</div>
                    </div>
                  ) : (
                    <div className="vacRequestList">
                      {requests.map((r) => {
                        const days = dayCount(r.startDate, r.endDate);
                        const statusClass = String(r.status).toLowerCase();
                        const sameDay = fmtFull(r.startDate) === fmtFull(r.endDate);
                        return (
                          <div key={r.id} className={`vacRequest vacRequest--${statusClass}`}>
                            <div className="vacRequestLeft">
                              <div className={`vacRequestDot vacRequestDot--${statusClass}`}>
                                {statusIcon(r.status)}
                              </div>
                              <div className="vacRequestInfo">
                                <div className="vacRequestDates">
                                  {sameDay
                                    ? fmtShort(r.startDate)
                                    : `${fmtShort(r.startDate)} → ${fmtShort(r.endDate)}`}
                                  <span className="vacRequestDays">
                                    {days} j
                                  </span>
                                </div>
                                {r.startTime && r.endTime ? (
                                  <div className="vacRequestTime">{r.startTime} – {r.endTime}</div>
                                ) : null}
                                {r.reason ? (
                                  <div className="vacRequestReason">{r.reason}</div>
                                ) : null}
                              </div>
                            </div>
                            <div className="vacRequestRight">
                              <span className={`vacBadge vacBadge--${statusClass}`}>
                                {statusLabel(r.status)}
                              </span>
                              {r.status === "PENDING" ? (
                                <form
                                  action={cancelPendingRequest.bind(
                                    null,
                                    r.id,
                                    employee.employeeCode
                                  )}
                                >
                                  <button className="vacBtnCancel" type="submit">
                                    Annuler
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
