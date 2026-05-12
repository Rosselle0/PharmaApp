import "./requests.css";
import { prisma } from "@/lib/prisma";
import { Department, Prisma, VacationStatus } from "@prisma/client";
import { getPrivilegedContextOrRedirect } from "@/lib/adminContext";
import ConfirmSubmitButton from "./ConfirmSubmitButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtShort(d: Date) {
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function fmtFull(d: Date) {
  return d.toLocaleDateString("fr-CA");
}

function statusLabel(status: VacationStatus) {
  switch (status) {
    case VacationStatus.PENDING:
      return "En attente";
    case VacationStatus.APPROVED:
      return "Approuvé";
    case VacationStatus.REJECTED:
      return "Rejeté";
    case VacationStatus.CANCELLED:
      return "Annulé";
    default:
      return String(status);
  }
}

function statusIcon(status: VacationStatus) {
  switch (status) {
    case VacationStatus.APPROVED:
      return "✓";
    case VacationStatus.REJECTED:
      return "✕";
    case VacationStatus.CANCELLED:
      return "—";
    default:
      return "•";
  }
}

function dayCount(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function deptLabel(d: string) {
  switch (d) {
    case "CASH": return "Caisse";
    case "LAB": return "Lab";
    default: return "Plancher";
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstQueryValue(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function AdminRequestsPage(props: { searchParams?: SearchParams }) {
  const { companyIds } = await getPrivilegedContextOrRedirect();
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const q = firstQueryValue(searchParams?.q).trim();

  const searchOr: Prisma.VacationRequestWhereInput[] = [];
  if (q) {
    searchOr.push(
      { employee: { firstName: { contains: q, mode: "insensitive" } } },
      { employee: { lastName: { contains: q, mode: "insensitive" } } },
      { reason: { contains: q, mode: "insensitive" } },
    );
    const deptQuery = q.toUpperCase();
    if (deptQuery === Department.FLOOR || deptQuery === Department.LAB || deptQuery === Department.CASH) {
      searchOr.push({ employee: { department: deptQuery as Department } });
    }
  }

  const searchFilter: Prisma.VacationRequestWhereInput =
    searchOr.length > 0 ? { OR: searchOr } : {};

  const pendingVac = await prisma.vacationRequest.findMany({
    where: {
      status: VacationStatus.PENDING,
      employee: { companyId: { in: companyIds } },
      ...searchFilter,
    },
    orderBy: { createdAt: "asc" },
    include: {
      employee: { select: { firstName: true, lastName: true, department: true } },
    },
  });

  const recentVac = await prisma.vacationRequest.findMany({
    where: {
      status: { in: [VacationStatus.APPROVED, VacationStatus.REJECTED, VacationStatus.CANCELLED] },
      employee: { companyId: { in: companyIds } },
      ...searchFilter,
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: {
      employee: { select: { firstName: true, lastName: true, department: true } },
    },
  });

  return (
    <main className="page requestsScope">
      <div className="rqShell">
        <div className="rqHero">
          <h1 className="rqTitle">Demandes</h1>
          <p className="rqSub">Centre d'approbation</p>
        </div>

        <div className="rqStats">
          <div className="rqStat rqStatPending">
            <div className="rqStatVal">{pendingVac.length}</div>
            <div className="rqStatLabel">En attente</div>
          </div>
          <div className="rqStat rqStatRecent">
            <div className="rqStatVal">{recentVac.length}</div>
            <div className="rqStatLabel">Récentes</div>
          </div>
        </div>

        <form className="rqSearchRow" method="get">
          <input
            className="rqSearchInput"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher employé, département, raison..."
            aria-label="Recherche demandes"
          />
          <button className="rqBtn rqBtnSecondary" type="submit">Rechercher</button>
          {q ? <a className="rqBtnLink" href="/admin/requests">Effacer</a> : null}
        </form>

        {/* ---- PENDING ---- */}
        <section className="rqSection">
          <div className="rqSectionHead">
            <div className="rqSectionTitle">
              En attente
              {pendingVac.length > 0 && (
                <span className="rqSectionCount rqSectionCountWarn">{pendingVac.length}</span>
              )}
            </div>
            {pendingVac.length > 0 && (
              <form
                action={async () => {
                  "use server";
                  const { deleteVacationBucket } = await import("./action");
                  await deleteVacationBucket("PENDING");
                }}
              >
                <ConfirmSubmitButton
                  className="rqBtnIcon rqBtnDanger"
                  title="Supprimer toutes les demandes en attente"
                  confirmMessage="Supprimer toutes les demandes en attente ?"
                >
                  🗑
                </ConfirmSubmitButton>
              </form>
            )}
          </div>

          {pendingVac.length === 0 ? (
            <div className="rqEmpty">Aucune demande en attente</div>
          ) : (
            <div className="rqList">
              {pendingVac.map((r) => {
                const days = dayCount(r.startDate, r.endDate);
                const sameDay = fmtFull(r.startDate) === fmtFull(r.endDate);
                return (
                  <div key={r.id} className="rqCard rqCard--pending">
                    <div className="rqCardMain">
                      <div className="rqCardAvatar">
                        {r.employee.firstName[0]}{r.employee.lastName[0]}
                      </div>
                      <div className="rqCardInfo">
                        <div className="rqCardName">
                          {r.employee.firstName} {r.employee.lastName}
                          <span className="rqCardDept">{deptLabel(r.employee.department)}</span>
                        </div>
                        <div className="rqCardMeta">
                          <span className="rqCardDate">
                            {sameDay
                              ? fmtShort(r.startDate)
                              : `${fmtShort(r.startDate)} → ${fmtShort(r.endDate)}`}
                          </span>
                          <span className="rqCardDays">{days}j</span>
                          {r.reason && <span className="rqCardReason">{r.reason}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="rqCardActions">
                      <form
                        action={async () => {
                          "use server";
                          const { approveVacation } = await import("./action");
                          await approveVacation(r.id);
                        }}
                      >
                        <button className="rqBtn rqBtnApprove" type="submit">Approuver</button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          const { rejectVacation } = await import("./action");
                          await rejectVacation(r.id);
                        }}
                      >
                        <button className="rqBtn rqBtnReject" type="submit">Refuser</button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          const { deleteVacationRequest } = await import("./action");
                          await deleteVacationRequest(r.id);
                        }}
                      >
                        <ConfirmSubmitButton
                          className="rqBtnIcon rqBtnDanger"
                          title="Supprimer"
                          confirmMessage="Supprimer cette demande ?"
                        >
                          🗑
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- RECENT ---- */}
        <section className="rqSection">
          <div className="rqSectionHead">
            <div className="rqSectionTitle">
              Récentes
              {recentVac.length > 0 && (
                <span className="rqSectionCount">{recentVac.length}</span>
              )}
            </div>
            {recentVac.length > 0 && (
              <form
                action={async () => {
                  "use server";
                  const { deleteVacationBucket } = await import("./action");
                  await deleteVacationBucket("RECENT");
                }}
              >
                <ConfirmSubmitButton
                  className="rqBtnIcon rqBtnDanger"
                  title="Supprimer toutes les demandes récentes"
                  confirmMessage="Supprimer toutes les demandes récentes ?"
                >
                  🗑
                </ConfirmSubmitButton>
              </form>
            )}
          </div>

          {recentVac.length === 0 ? (
            <div className="rqEmpty">Aucune décision récente</div>
          ) : (
            <div className="rqList">
              {recentVac.map((r) => {
                const days = dayCount(r.startDate, r.endDate);
                const sameDay = fmtFull(r.startDate) === fmtFull(r.endDate);
                const st = r.status.toLowerCase();
                return (
                  <div key={r.id} className={`rqCard rqCard--${st}`}>
                    <div className="rqCardMain">
                      <div className={`rqCardDot rqCardDot--${st}`}>
                        {statusIcon(r.status)}
                      </div>
                      <div className="rqCardInfo">
                        <div className="rqCardName">
                          {r.employee.firstName} {r.employee.lastName}
                          <span className={`rqBadge rqBadge--${st}`}>{statusLabel(r.status)}</span>
                        </div>
                        <div className="rqCardMeta">
                          <span className="rqCardDate">
                            {sameDay
                              ? fmtShort(r.startDate)
                              : `${fmtShort(r.startDate)} → ${fmtShort(r.endDate)}`}
                          </span>
                          <span className="rqCardDays">{days}j</span>
                        </div>
                      </div>
                    </div>
                    <div className="rqCardActions">
                      {r.status === "APPROVED" && (
                        <form
                          action={async () => {
                            "use server";
                            const { cancelApprovedVacation } = await import("./action");
                            await cancelApprovedVacation(r.id);
                          }}
                        >
                          <button className="rqBtn rqBtnReject rqBtnCompact" type="submit">Annuler</button>
                        </form>
                      )}
                      <form
                        action={async () => {
                          "use server";
                          const { deleteVacationRequest } = await import("./action");
                          await deleteVacationRequest(r.id);
                        }}
                      >
                        <ConfirmSubmitButton
                          className="rqBtnIcon rqBtnDanger"
                          title="Supprimer"
                          confirmMessage="Supprimer cette demande ?"
                        >
                          🗑
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
