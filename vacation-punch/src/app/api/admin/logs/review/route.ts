export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = await req.json();

    const shiftId = String(body?.shiftId ?? "").trim();
    const kindRaw = String(body?.kind ?? "").toUpperCase();
    const kind = kindRaw === "LATE" || kindRaw === "OVERTIME" ? kindRaw : null;

    if (!shiftId || !kind) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    // We keep this as an audit-only action (no schema change needed).
    const action = kind === "LATE" ? "LATE_REVIEWED" : "OVERTIME_REVIEWED";

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        companyId: auth.companyId,
        action,
        target: shiftId,
        meta: {
          kind,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Review failed" }, { status: 500 });
  }
}

