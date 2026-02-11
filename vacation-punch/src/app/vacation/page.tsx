import "./vacation.css";
import { prisma } from "@/lib/prisma";
import { VacationStatus } from "@prisma/client";
import { enterEmployeeCode, createVacationRequest, cancelPendingRequest } from "./actions";
import Link from "next/link";


function fmt(d: Date) {
  return d.toLocaleDateString("fr-CA");
}
function badgeClass(s: VacationStatus) {
  if (s === "PENDING") return "badge pending";
  if (s === "APPROVED") return "badge approved";
  if (s === "REJECTED") return "badge rejected";
  return "badge cancelled";
}

export default async function VacationPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }> | { code?: string };
}) {
  const sp = (searchParams instanceof Promise ? await searchParams : searchParams) ?? {};
  const code = String(sp.code ?? "").trim();

  const employee = code
    ? await prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, isActive: true },
    })
    : null;

  const requests = employee
    ? await prisma.vacationRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
    })
    : [];
  const returnHref = code ? `/kiosk?code=${encodeURIComponent(code)}` : "/kiosk";

  return (
    <main className="page">
      <div className="shell">
        <div className="head">
          <div>
            <h1 className="h1">Vacances</h1>
            <p className="p">Entrez votre code employé pour demander des vacances.</p>
          </div>

          <Link className="btn" href={returnHref}>
            Retour
          </Link>
        </div>
        {!employee || !employee.isActive ? (
          <section className="card">
            <h2 className="h2">Identification</h2>
            <form className="form one" action={enterEmployeeCode}>
              <label className="label">
                Code employé
                <input className="input" name="employeeCode" placeholder="Ex. 8 chiffres" required />
              </label>
              <button className="btn" type="submit">Continuer</button>
            </form>
            {code ? <div className="muted">Code invalide ou employé inactif.</div> : null}
          </section>
        ) : (
          <>

            <section className="card">
              <h2 className="h2">
                Demande de vacances — {employee.firstName} {employee.lastName}
              </h2>
              <form className="form" action={createVacationRequest}>
                <input type="hidden" name="employeeCode" value={employee.employeeCode} />
                <label className="label">
                  Début
                  <input className="input" type="date" name="start" required />
                </label>
                <label className="label">
                  Fin
                  <input className="input" type="date" name="end" required />
                </label>
                <label className="label">
                  Raison (optionnel)
                  <input className="input" name="reason" placeholder="Voyage, rendez-vous..." />
                </label>
                <button className="btn" type="submit">Soumettre</button>
              </form>
            </section>

            <section className="card">
              <h2 className="h2">Mes demandes</h2>
              {requests.length === 0 ? (
                <div className="muted">Aucune demande pour le moment.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Raison</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td>{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                        <td className="muted">{r.reason ?? "—"}</td>
                        <td><span className={badgeClass(r.status)}>{r.status}</span></td>
                        <td style={{ textAlign: "right" }}>
                          {r.status === "PENDING" ? (
                            <form action={cancelPendingRequest.bind(null, r.id, employee.employeeCode)}>
                              <button className="btn danger" type="submit">Annuler</button>
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
          </>
        )}
      </div>
    </main>
  );
}
