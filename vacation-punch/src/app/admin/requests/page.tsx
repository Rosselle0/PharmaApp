import "./requests.css";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { VacationStatus } from "@prisma/client";
import { getAdminContextOrRedirect } from "./_helper";


function fmt(d: Date) {
  return d.toLocaleDateString("fr-CA");
}

export default async function AdminRequestsPage() {
  const { companyIds } = await getAdminContextOrRedirect();
  

  const pendingVac = await prisma.vacationRequest.findMany({
    where: {
      status: VacationStatus.PENDING,
      employee: { companyId: { in: companyIds } },
    },
    orderBy: { createdAt: "asc" },
    include: { employee: { select: { firstName: true, lastName: true, department: true } } },
  });

  const recentVac = await prisma.vacationRequest.findMany({
    where: {
      status: { in: [VacationStatus.APPROVED, VacationStatus.REJECTED, VacationStatus.CANCELLED] },
      employee: { companyId: { in: companyIds } },
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: { employee: { select: { firstName: true, lastName: true, department: true } } },
  });

  return (
    <main className="page">
      <div className="shell">
        <div className="head">
          <div>
            <h1 className="h1">Demandes</h1>
            <p className="p">Centre d’approbation (vacances pour l’instant).</p>
          </div>

          <div className="row">
            <Link className="btn" href="/admin/dashboard">Retour</Link>
            <Link className="btn" href="/schedule">Horaire</Link>
          </div>
        </div>

        <section className="card">
          <h2 className="h2">Vacances — En attente</h2>
          {pendingVac.length === 0 ? (
            <div className="muted">Aucune demande en attente.</div>
          ) : (
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
                      {r.employee.firstName} {r.employee.lastName}
                      <div className="muted">{r.employee.department}</div>
                    </td>
                    <td>{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                    <td className="muted">{r.reason ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row">
                        <form action={async () => { "use server"; const { approveVacation } = await import("./action"); await approveVacation(r.id); }}>
                          <button className="btn" type="submit">Approuver</button>
                        </form>
                        <form action={async () => { "use server"; const { rejectVacation } = await import("./action"); await rejectVacation(r.id); }}>
                          <button className="btn danger" type="submit">Refuser</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="h2">Vacances — Récentes</h2>
          {recentVac.length === 0 ? (
            <div className="muted">Aucune décision récente.</div>
          ) : (
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
                    <td>{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                    <td><span className="tag">{r.status}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "APPROVED" ? (
                        <form action={async () => { "use server"; const { cancelApprovedVacation } = await import("./action"); await cancelApprovedVacation(r.id); }}>
                          <button className="btn danger" type="submit">Annuler l’approbation</button>
                        </form>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
