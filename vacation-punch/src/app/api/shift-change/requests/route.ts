export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";

export async function GET(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const inbound = await prisma.shiftChangeRequest.findMany({
    where: {
      companyId: auth.companyId,
      candidateEmployeeId: auth.employeeId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      message: true,
      createdAt: true,
      shift: { select: { id: true, startTime: true, endTime: true } },
      requesterEmployee: { select: { firstName: true, lastName: true, department: true, role: true } },
    },
  });

  return NextResponse.json({ ok: true, inbound });
}

export async function POST(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shiftId = String(body?.shiftId || "").trim();
  const candidateEmployeeId = String(body?.candidateEmployeeId || "").trim();
  const message = body?.message ? String(body.message).slice(0, 300) : null;

  if (!shiftId || !candidateEmployeeId) {
    return NextResponse.json({ ok: false, error: "shiftId et candidateEmployeeId requis" }, { status: 400 });
  }

  // Ensure shift belongs to requester
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, employeeId: true, employee: { select: { companyId: true } } },
  });
  if (!shift) return NextResponse.json({ ok: false, error: "Quart introuvable" }, { status: 404 });
  if (shift.employee.companyId !== auth.companyId) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });
  if (shift.employeeId !== auth.employeeId) return NextResponse.json({ ok: false, error: "Ce quart n'est pas le tien" }, { status: 403 });

  // Create (unique constraint prevents duplicates)
  const created = await prisma.shiftChangeRequest.create({
    data: {
      companyId: auth.companyId,
      shiftId,
      requesterEmployeeId: auth.employeeId,
      candidateEmployeeId,
      message,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId || "").trim();
  const action = String(body?.action || "").trim(); // "accept" | "reject"

  if (!requestId || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ ok: false, error: "requestId + action requis" }, { status: 400 });
  }

  const reqRow = await prisma.shiftChangeRequest.findUnique({
    where: { id: requestId },
    select: { id: true, companyId: true, candidateEmployeeId: true, status: true },
  });

  if (!reqRow) return NextResponse.json({ ok: false, error: "Demande introuvable" }, { status: 404 });
  if (reqRow.companyId !== auth.companyId) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });
  if (reqRow.candidateEmployeeId !== auth.employeeId) return NextResponse.json({ ok: false, error: "Pas pour toi" }, { status: 403 });
  if (reqRow.status !== "PENDING") return NextResponse.json({ ok: false, error: "Déjà traitée" }, { status: 409 });

  const status = action === "accept" ? "ACCEPTED" : "REJECTED";

  await prisma.shiftChangeRequest.update({
    where: { id: requestId },
    data: { status, decidedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}