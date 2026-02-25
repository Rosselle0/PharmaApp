export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTerminal } from "@/lib/kioskTerminalAuth";
import { allowedNext } from "@/lib/punchRules";

export async function GET(req: Request) {
  const term = await requireTerminal();
  if (!term.ok) return NextResponse.json({ ok: false, error: term.error }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pin = String(searchParams.get("pin") || "").trim();
  if (!pin) return NextResponse.json({ ok: false, error: "PIN requis" }, { status: 400 });

  const emp = await prisma.employee.findFirst({
    where: { companyId: term.companyId, employeeCode: pin, isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!emp) return NextResponse.json({ ok: false, error: "PIN invalide" }, { status: 404 });

  const last = await prisma.punchEvent.findFirst({
    where: { employeeId: emp.id }, 
    orderBy: { at: "desc" },
    select: { type: true, at: true },
  });

  const lastType = (last?.type as any) ?? null;

  return NextResponse.json({
    ok: true,
    employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}` },
    last: last ? { type: last.type, at: last.at } : null,
    allowed: allowedNext(lastType),
  });
}