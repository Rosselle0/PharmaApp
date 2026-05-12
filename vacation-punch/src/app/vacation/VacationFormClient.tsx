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
  const dayCount = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start + "T12:00:00");
    const e = new Date(end + "T12:00:00");
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }, [start, end]);

  return (
    <section className="vacCard vacCardForm">
      <div className="vacCardHead">
        <h2 className="vacCardTitle">Nouvelle demande</h2>
      </div>

      <form className="vacForm" action={createVacationRequest}>
        <input type="hidden" name="employeeCode" value={employeeCode} />

        <div className="vacFormGrid">
          <div className="vacField">
            <label className="vacFieldLabel" htmlFor="vac-start">Début</label>
            <input
              id="vac-start"
              className="vacInput"
              type="date"
              name="start"
              required
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                setStart(v);
                if (!end && v) setEnd(v);
                if (end && v && end < v) setEnd(v);
              }}
            />
          </div>

          <div className="vacField">
            <label className="vacFieldLabel" htmlFor="vac-end">Fin</label>
            <input
              id="vac-end"
              className="vacInput"
              type="date"
              name="end"
              required
              min={start || undefined}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        {dayCount > 0 && (
          <div className="vacDayPreview">
            <span className="vacDayPreviewNum">{dayCount}</span>
            <span>{dayCount === 1 ? "jour" : "jours"}</span>
          </div>
        )}

        <div className="vacField">
          <label className="vacFieldLabel" htmlFor="vac-reason">Raison</label>
          <input
            id="vac-reason"
            className="vacInput"
            name="reason"
            placeholder="Optionnel — Voyage, rendez-vous..."
          />
        </div>

        {singleDay && (
          <div className="vacTimeSection">
            <div className="vacTimeSectionLabel">Plage horaire (journée partielle)</div>
            <div className="vacFormGrid">
              <div className="vacField">
                <label className="vacFieldLabel" htmlFor="vac-startTime">De</label>
                <input id="vac-startTime" className="vacInput" type="time" name="startTime" />
              </div>
              <div className="vacField">
                <label className="vacFieldLabel" htmlFor="vac-endTime">À</label>
                <input id="vac-endTime" className="vacInput" type="time" name="endTime" />
              </div>
            </div>
          </div>
        )}

        <button className="vacBtn vacBtnPrimary vacBtnSubmit" type="submit">
          Soumettre la demande
        </button>
      </form>
    </section>
  );
}
