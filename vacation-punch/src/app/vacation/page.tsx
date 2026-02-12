import "./vacation.css";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { enterEmployeeCode, cancelPendingRequest } from "./actions";
import VacationFormClient from "./VacationFormClient";

function fmt(d: Date) {
  return d.toLocaleDateString("fr-CA");
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
              <button className="btn primary" type="submit">
                Continuer
              </button>
            </form>
            {code ? <div className="muted">Code invalide ou employé inactif.</div> : null}
          </section>
        ) : (
          <>
            <VacationFormClient
              employeeCode={employee.employeeCode}
              employeeName={`${employee.firstName} ${employee.lastName}`}
            />

            <section className="card">
              <h2 className="h2">Mes demandes</h2>

              {requests.length === 0 ? (
                <div className="empty">Aucune demande pour le moment.</div>
              ) : (
                <div className="tableWrap">
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
                          <td>
                            {fmt(r.startDate)} → {fmt(r.endDate)}
                            {r.startTime && r.endTime ? (
                              <div className="muted">
                                Heure: {r.startTime} – {r.endTime}
                              </div>
                            ) : null}
                          </td>

                          <td className="muted">{r.reason ?? "—"}</td>

                          <td>
                            <span className={`badge ${String(r.status).toLowerCase()}`}>{r.status}</span>
                          </td>

                          <td style={{ textAlign: "right" }}>
                            {r.status === "PENDING" ? (
                              <form action={cancelPendingRequest.bind(null, r.id, employee.employeeCode)}>
                                <button className="btn danger" type="submit">
                                  Annuler
                                </button>
                              </form>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
