"use client";

import { useEffect } from "react";

type Props = {
  section: "CAISSE_LAB" | "FLOOR";
};

export default function ScheduleDomOrderSync({ section }: Props) {
  useEffect(() => {
    const key = `schedule-edit-order:${section}`;
    const raw = (window.localStorage.getItem(key) ?? "").trim();
    if (!raw) return;

    const order = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (order.length === 0) return;

    // Desktop table rows
    const tbody = document.querySelector(".tableWrap .table tbody");
    if (tbody) {
      const byId = new Map<string, Element>();
      tbody.querySelectorAll("tr[data-emp-id]").forEach((row) => {
        const id = row.getAttribute("data-emp-id");
        if (id) byId.set(id, row);
      });
      for (const id of order) {
        const row = byId.get(id);
        if (row) tbody.appendChild(row);
      }
    }

    // Mobile day cards rows
    document.querySelectorAll(".mobileDayBody").forEach((dayBody) => {
      const byId = new Map<string, Element>();
      dayBody.querySelectorAll(".mobileShiftRow[data-emp-id]").forEach((row) => {
        const id = row.getAttribute("data-emp-id");
        if (id) byId.set(id, row);
      });
      for (const id of order) {
        const row = byId.get(id);
        if (row) dayBody.appendChild(row);
      }
    });
  }, [section]);

  return null;
}

