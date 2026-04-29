"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  section: "CAISSE_LAB" | "FLOOR";
};

export default function OrderSyncClient({ section }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    const existingOrder = (sp.get("order") ?? "").trim();
    if (existingOrder) return;

    const key = `schedule-edit-order:${section}`;
    const stored = (window.localStorage.getItem(key) ?? "").trim();
    if (!stored) return;

    const ids = stored
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    const next = new URLSearchParams(sp.toString());
    next.set("order", ids.join(","));
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, section, sp]);

  return null;
}

