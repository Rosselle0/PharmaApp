"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { resolveScheduleOrderClient } from "@/lib/schedule/employeeOrder";

type Props = {
  weekYmd: string;
  section: "CAISSE_LAB" | "FLOOR";
  className?: string;
  /** When set (edit page), always use this order instead of reading storage/DOM. */
  orderOverride?: string;
  children?: React.ReactNode;
};

export default function ScheduleExportLink({
  weekYmd,
  section,
  className,
  orderOverride,
  children,
}: Props) {
  const searchParams = useSearchParams();

  const href = useMemo(() => {
    const order =
      orderOverride?.trim() ||
      resolveScheduleOrderClient(section, searchParams.get("order"));
    const q = new URLSearchParams({
      week: weekYmd,
      section,
    });
    if (order) q.set("order", order);
    return `/api/schedule/export?${q.toString()}`;
  }, [weekYmd, section, orderOverride, searchParams]);

  return (
    <a href={href} className={className}>
      {children ?? "⬇ Télécharger PDF (2 semaines)"}
    </a>
  );
}
