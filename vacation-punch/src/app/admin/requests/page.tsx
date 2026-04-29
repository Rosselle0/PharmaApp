import "./requests.css";
import { prisma } from "@/lib/prisma";
import { Department, Prisma, VacationStatus } from "@prisma/client";
import { getPrivilegedContextOrRedirect } from "@/lib/adminContext";
import ConfirmSubmitButton from "./ConfirmSubmitButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(d: Date) {
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
      <div className="shell">
        <div className="head">
          <div>
            <h1 className="h1">Demandes</h1>
            <p className="p">Centre d’approbation (vacances pour l’instant).</p>
          </div>

          <div className="actions" />
        </div>

        <form className="requestsSearchRow" method="get">
          <input
            className="requestsSearchInput"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher employé, département, raison..."
            aria-label="Recherche demandes"
          />
          <button className="btn" type="submit">
            Rechercher
          </button>
          {q ? (
            <a className="btn" href="/admin/requests">
              Effacer
            </a>
          ) : null}
        </form>

        <section className="card">
          <div className="cardHeadRow">
            <h2 className="h2">Vacances — En attente</h2>
            {pendingVac.length > 0 ? (
              <form
                action={async () => {
                  "use server";
                  const { deleteVacationBucket } = await import("./action");
                  await deleteVacationBucket("PENDING");
                }}
              >
                <ConfirmSubmitButton
                  className="btn danger iconOnly"
                  title="Supprimer toutes les demandes en attente"
                  confirmMessage="Supprimer toutes les demandes en attente ?"
                >
                  🗑
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
          {pendingVac.length === 0 ? (
            <div className="muted">Aucune demande en attente.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Période</th>
                    <th>Raison</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingVac.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="cellTitle">{r.employee.firstName} {r.employee.lastName}</div>
                        <div className="cellSub">{r.employee.department}</div>
                      </td>

                      <td>
                        {fmt(r.startDate)} → {fmt(r.endDate)}
                      </td>
                      <td className="muted">{r.reason ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="actions">
                          <form
                            action={async () => {
                              "use server";
                              const { approveVacation } = await import("./action");
                              await approveVacation(r.id);
                            }}
                          >
                            <button className="btn" type="submit">
                              Approuver
                            </button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              const { rejectVacation } = await import("./action");
                              await rejectVacation(r.id);
                            }}
                          >
                            <button className="btn danger" type="submit">
                              Refuser
                            </button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              const { deleteVacationRequest } = await import("./action");
                              await deleteVacationRequest(r.id);
                            }}
                          >
                            <ConfirmSubmitButton
                              className="btn danger iconOnly"
                              title="Supprimer cette demande"
                              confirmMessage="Supprimer cette demande ?"
                            >
                              🗑
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardHeadRow">
            <h2 className="h2">Vacances — Récentes</h2>
            {recentVac.length > 0 ? (
              <form
                action={async () => {
                  "use server";
                  const { deleteVacationBucket } = await import("./action");
                  await deleteVacationBucket("RECENT");
                }}
              >
                <ConfirmSubmitButton
                  className="btn danger iconOnly"
                  title="Supprimer toutes les demandes récentes"
                  confirmMessage="Supprimer toutes les demandes récentes ?"
                >
                  🗑
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
          {recentVac.length === 0 ? (
            <div className="muted">Aucune décision récente.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Période</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentVac.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.employee.firstName} {r.employee.lastName}
                        <div className="muted">{r.employee.department}</div>
                      </td>
                      <td>
                        {fmt(r.startDate)} → {fmt(r.endDate)}
                      </td>
                      <td>
                        <span className={`tag ${r.status.toLowerCase()}`}>{statusLabel(r.status)}</span>

                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="actions">
                          {r.status === "APPROVED" ? (
                            <form
                              action={async () => {
                                "use server";
                                const { cancelApprovedVacation } = await import("./action");
                                await cancelApprovedVacation(r.id);
                              }}
                            >
                              <button className="btn danger compactAction" type="submit">
                                Annuler l’approbation
                              </button>
                            </form>
                          ) : null}
                          <form
                            action={async () => {
                              "use server";
                              const { deleteVacationRequest } = await import("./action");
                              await deleteVacationRequest(r.id);
                            }}
                          >
                            <ConfirmSubmitButton
                              className="btn danger iconOnly"
                              title="Supprimer cette demande"
                              confirmMessage="Supprimer cette demande ?"
                            >
                              🗑
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
