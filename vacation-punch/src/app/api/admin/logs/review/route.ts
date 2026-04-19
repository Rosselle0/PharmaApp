export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { messageFromUnknown } from "@/lib/unknownError";

const TZ = process.env.APP_TZ || "America/Toronto";

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function partsInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    da: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
  };
}

function makeDateInTZ(ymd: string, hhmm: string) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  let utc = Date.UTC(Y, M - 1, D, hh, mm, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = partsInTZ(new Date(utc));
    const diffMin =
      (p.y - Y) * 525600 +
      (p.mo - M) * 43200 +
      (p.da - D) * 1440 +
      (p.hh - hh) * 60 +
      (p.mm - mm);
    if (diffMin === 0) break;
    utc -= diffMin * 60000;
  }
  return new Date(utc);
}

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = await req.json();

    const shiftId = String(body?.shiftId ?? "").trim();
    const kindRaw = String(body?.kind ?? "").toUpperCase();
    const kind = kindRaw === "LATE" || kindRaw === "OVERTIME" ? kindRaw : null;
    const decisionRaw = String(body?.decision ?? body?.accepted ?? "").toUpperCase();
    const decision =
      decisionRaw === "REJECT" || decisionRaw === "REJECTED"
        ? "REJECT"
        : decisionRaw === "ACCEPT" || decisionRaw === "ACCEPTED" || decisionRaw === "TRUE"
          ? "ACCEPT"
          : "ACCEPT"; // backward compatible: missing => accept

    if (!shiftId || !kind) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const manualEndHHMM = String(body?.manualEndHHMM ?? "").trim();
    const hasManualEnd = /^([01]\d|2[0-3]):([0-5]\d)$/.test(manualEndHHMM);

    if (kind === "OVERTIME" && decision === "ACCEPT" && hasManualEnd) {
      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        select: { id: true, startTime: true, endTime: true },
      });
      if (!shift) {
        return NextResponse.json({ ok: false, error: "Shift introuvable" }, { status: 404 });
      }
      const ymd = ymdInTZ(shift.startTime);
      let manualEnd = makeDateInTZ(ymd, manualEndHHMM);
      if (manualEnd.getTime() < shift.startTime.getTime()) {
        // allow overnight adjustment if manager enters after-midnight end time
        manualEnd = new Date(manualEnd.getTime() + 24 * 60 * 60 * 1000);
      }

      await prisma.shift.update({
        where: { id: shiftId },
        data: { endTime: manualEnd },
      });
    }

    // We keep this as an audit-only action (no schema change needed).
    const action =
      kind === "LATE"
        ? decision === "ACCEPT"
          ? "LATE_ACCEPTED"
          : "LATE_REJECTED"
        : decision === "ACCEPT"
          ? "OVERTIME_ACCEPTED"
          : "OVERTIME_REJECTED";

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        companyId: auth.companyId,
        action,
        target: shiftId,
        meta: {
          kind,
          decision,
          manualEndHHMM: hasManualEnd ? manualEndHHMM : null,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: messageFromUnknown(e) || "Review failed" }, { status: 500 });
  }
}

