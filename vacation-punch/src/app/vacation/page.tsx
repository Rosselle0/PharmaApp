import "./vacation.css";
import { prisma } from "@/lib/prisma";
import { enterEmployeeCode, cancelPendingRequest } from "./actions";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import VacationFormClient from "./VacationFormClient";
import KioskSidebar from "@/components/KioskSidebar";

function statusLabel(status: any) {
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


function fmt(d: Date) {
  return d.toLocaleDateString("fr-CA");
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
  // Only override theme when explicitly provided.
  // Otherwise rely on the global ThemeProvider (html[data-theme]).
  const theme =
    sp.theme === "dark" || sp.theme === "light" ? (sp.theme as "dark" | "light") : undefined;

  const employee = code
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
            <div className="head">
              <div>
                <h1 className="h1">Vacances</h1>
                <p className="p">
                  Entrez votre code employé pour demander des vacances.
                </p>
              </div>
            </div>

            {!employee || !employee.isActive ? (
              <section className="card">
                <h2 className="h2">Identification</h2>

                <form className="form one" action={enterEmployeeCode}>
                  <label className="label">
                    Code employé
                    <input
                      className="input"
                      name="employeeCode"
                      placeholder="Ex. 8 chiffres"
                      required
                    />
                  </label>

                  <button className="btn primary" type="submit">
                    Continuer
                  </button>
                </form>

                {code ? (
                  <div className="muted">
                    Code invalide ou employé inactif.
                  </div>
                ) : null}
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
                    <div className="empty">
                      Aucune demande pour le moment.
                    </div>
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
                                <span
                                  className={`badge ${String(
                                    r.status
                                  ).toLowerCase()}`}
                                >
                                  {statusLabel(r.status)}
                                </span>
                              </td>

                              <td style={{ textAlign: "right" }}>
                                {r.status === "PENDING" ? (
                                  <form
                                    action={cancelPendingRequest.bind(
                                      null,
                                      r.id,
                                      employee.employeeCode
                                    )}
                                  >
                                    <button
                                      className="btn danger"
                                      type="submit"
                                    >
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
        </div>
      </div>
    </div>
  );
}