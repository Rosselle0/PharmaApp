"use client";

import { useMemo, useState } from "react";
import { createVacationRequest } from "./actions";

type Props = {
  employeeCode: string;
  employeeName: string;
};

export default function VacationFormClient({ employeeCode, employeeName }: Props) {
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  const singleDay = useMemo(() => !!start && !!end && start === end, [start, end]);

  return (
    <section className="card">
      <h2 className="h2">Demande de vacances — {employeeName}</h2>

      <form className="form" action={createVacationRequest}>
        <input type="hidden" name="employeeCode" value={employeeCode} />

        <label className="label">
          Début
          <input
            className="input"
            type="date"
            name="start"
            required
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              setStart(v);

              // Keep end valid
              if (!end && v) setEnd(v);
              if (end && v && end < v) setEnd(v);
            }}
          />
        </label>

        <label className="label">
          Fin
          <input
            className="input"
            type="date"
            name="end"
            required
            min={start || undefined} // prevents clicking before start date
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>

        <label className="label">
          Raison (optionnel)
          <input className="input" name="reason" placeholder="Voyage, rendez-vous..." />
        </label>

        <div className="formRow">
          <div className="hint">
            Optionnel — si c’est une seule journée (Début = Fin), vous pouvez préciser une plage horaire d’indisponibilité.
          </div>

          <div className={`timeGrid ${singleDay ? "" : "disabled"}`}>
            <label className="label">
              Heure début (1 jour)
              <input className="input" type="time" name="startTime" disabled={!singleDay} />
            </label>

            <label className="label">
              Heure fin (1 jour)
              <input className="input" type="time" name="endTime" disabled={!singleDay} />
            </label>
          </div>

          {!singleDay ? <div className="muted">(Les heures s’activent seulement si Début = Fin.)</div> : null}
        </div>

        <button className="btn primary" type="submit">
          Soumettre
        </button>
      </form>
    </section>
  );
}
