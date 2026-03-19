export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";
import { sendShiftChangeAcceptedEmail, sendShiftChangeRequestEmail } from "@/lib/mailer";

function startOfDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function nextDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
}
function ymdUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const url = new URL(req.url);
  const scope = String(url.searchParams.get("scope") ?? "inbound");
  const shiftId = String(url.searchParams.get("shiftId") ?? "").trim();

  if (scope === "sent") {
    const where: any = {
      companyId: auth.companyId,
      requesterEmployeeId: auth.employeeId,
    };
    if (shiftId) where.shiftId = shiftId;

    const sent = await prisma.shiftChangeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        shift: { select: { id: true, startTime: true, endTime: true } },
        candidateEmployee: { select: { id: true, firstName: true, lastName: true, department: true, role: true } },
      },
    });

    return NextResponse.json({ ok: true, sent });
  }

  // default: inbound (your current code)
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

// ✅ Batch POST (multi-select)
export async function POST(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);

  const shiftId = String(body?.shiftId ?? "").trim();
  const rawIds = body?.candidateEmployeeIds ?? body?.candidateIds ?? body?.candidateEmployeeId; // supports old shape too
  const message = body?.message ? String(body.message).slice(0, 300) : null;

  // normalize candidate ids to string[]
  const candidateEmployeeIds: string[] = Array.isArray(rawIds)
    ? rawIds.map((x: any) => String(x).trim()).filter(Boolean)
    : rawIds
      ? [String(rawIds).trim()].filter(Boolean)
      : [];

  if (!shiftId) {
    return NextResponse.json({ ok: false, error: "shiftId requis" }, { status: 400 });
  }
  if (candidateEmployeeIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Choisis au moins 1 employé." }, { status: 400 });
  }

  // Ensure shift exists, belongs to requester, and is in same company
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      employeeId: true,
      startTime: true,
      endTime: true,
      employee: { select: { companyId: true } },
    },
  });
  if (!shift) return NextResponse.json({ ok: false, error: "Quart introuvable" }, { status: 404 });
  if (shift.employee.companyId !== auth.companyId) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });
  }
  if (shift.employeeId !== auth.employeeId) {
    return NextResponse.json({ ok: false, error: "Ce quart n'est pas le tien" }, { status: 403 });
  }

  // Validate candidates: same company + active
  const candidates = await prisma.employee.findMany({
    where: {
      id: { in: candidateEmployeeIds },
      companyId: auth.companyId,
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const okIds = new Set(candidates.map((c) => c.id));
  const rows = candidateEmployeeIds
    .filter((id) => okIds.has(id))
    .map((candidateEmployeeId) => ({
      companyId: auth.companyId,
      shiftId,
      requesterEmployeeId: auth.employeeId,
      candidateEmployeeId,
      message,
      // status defaults to PENDING in schema, no need to set
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun candidat valide." }, { status: 400 });
  }

  // Create many, skip duplicates (your @@unique([shiftId, candidateEmployeeId]))
  const created = await prisma.shiftChangeRequest.createMany({
    data: rows,
    skipDuplicates: true,
  });

  // Notify recipients by email when they have one. Non-blocking.
  const requester = await prisma.employee.findUnique({
    where: { id: auth.employeeId },
    select: { firstName: true, lastName: true },
  });
  const requesterName = `${requester?.firstName ?? ""} ${requester?.lastName ?? ""}`.trim() || "Un employé";

  await Promise.allSettled(
    candidates
      .filter((c) => Boolean(c.email))
      .map((c) =>
        sendShiftChangeRequestEmail({
          to: String(c.email),
          candidateFirstName: c.firstName,
          requesterName,
          shiftStart: shift.startTime,
          shiftEnd: shift.endTime,
          note: message,
        })
      )
  );

  return NextResponse.json({
    ok: true,
    created: created.count,
    attempted: rows.length,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId || "").trim();
  const action = String(body?.action || "").trim(); // "accept" | "reject" | "cancel"

  if (!requestId || (action !== "accept" && action !== "reject" && action !== "cancel")) {
    return NextResponse.json({ ok: false, error: "requestId + action requis" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Load request with everything needed
      const reqRow = await tx.shiftChangeRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          companyId: true,
          shiftId: true,
          status: true,
          candidateEmployeeId: true,
          requesterEmployeeId: true,
        },
      });

      if (!reqRow) return { ok: false as const, status: 404, error: "Demande introuvable" };
      if (reqRow.companyId !== auth.companyId) return { ok: false as const, status: 403, error: "Accès refusé" };

      // Only candidate can accept/reject
      if (action === "accept" || action === "reject") {
        if (reqRow.candidateEmployeeId !== auth.employeeId)
          return { ok: false as const, status: 403, error: "Pas pour toi" };
      } else if (action === "cancel") {
        // Only requester can cancel
        if (reqRow.requesterEmployeeId !== auth.employeeId)
          return { ok: false as const, status: 403, error: "Pas pour toi" };
      }

      if (reqRow.status !== "PENDING")
        return { ok: false as const, status: 409, error: "Déjà traitée" };

      if (action === "reject") {
        await tx.shiftChangeRequest.update({
          where: { id: reqRow.id },
          data: { status: "REJECTED", decidedAt: new Date() },
        });
        return { ok: true as const };
      }

      if (action === "cancel") {
        await tx.shiftChangeRequest.update({
          where: { id: reqRow.id },
          data: { status: "CANCELLED", decidedAt: new Date() },
        });
        return { ok: true as const };
      }

      // action === "accept" -> MOVE SHIFT + mark accepted + cancel others

      // Re-check shift still exists and still owned by requester
      const shift = await tx.shift.findUnique({
        where: { id: reqRow.shiftId },
        select: { id: true, employeeId: true, startTime: true, endTime: true, status: true },
      });

      if (!shift) return { ok: false as const, status: 404, error: "Quart introuvable" };
      if (shift.status !== "PLANNED")
        return { ok: false as const, status: 409, error: "Quart non transférable" };

      // Must still belong to the requester at accept time
      if (shift.employeeId !== reqRow.requesterEmployeeId)
        return { ok: false as const, status: 409, error: "Quart déjà transféré / changé" };

      // ✅ OPTIONAL: prevent overlap for candidate
      const overlap = await tx.shift.findFirst({
        where: {
          employeeId: reqRow.candidateEmployeeId,
          status: "PLANNED",
          NOT: { id: shift.id },
          AND: [
            { startTime: { lt: shift.endTime } }, // existing starts before new ends
            { endTime: { gt: shift.startTime } }, // existing ends after new starts
          ],
        },
        select: { id: true },
      });

      if (overlap) {
        return { ok: false as const, status: 409, error: "Conflit: tu as déjà un quart à ce moment." };
      }

      // 1) Mark accepted
      await tx.shiftChangeRequest.update({
        where: { id: reqRow.id },
        data: { status: "ACCEPTED", decidedAt: new Date() },
      });

      // 2) Move the shift to candidate
      await tx.shift.update({
        where: { id: shift.id },
        data: { employeeId: reqRow.candidateEmployeeId },
      });

      // 3) Transfer task assignments from requester -> candidate for that exact day.
      //    This makes the task list "follow" the employee after the switch.
      const dayYmd = ymdUTC(shift.startTime);
      const dayStart = startOfDayUTC(dayYmd);
      const dayEnd = nextDayUTC(dayYmd);

      // Load all assignments for requester on that day (with items)
      const requesterAssignments = await tx.taskAssignment.findMany({
        where: {
          companyId: reqRow.companyId,
          employeeId: reqRow.requesterEmployeeId,
          date: { gte: dayStart, lt: dayEnd },
        },
        include: {
          items: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Remove candidate existing assignments on that day, then copy from requester.
      await tx.taskAssignment.deleteMany({
        where: {
          companyId: reqRow.companyId,
          employeeId: reqRow.candidateEmployeeId,
          date: { gte: dayStart, lt: dayEnd },
        },
      });

      for (const a of requesterAssignments) {
        await tx.taskAssignment.create({
          data: {
            companyId: reqRow.companyId,
            employeeId: reqRow.candidateEmployeeId,
            date: dayStart,
            title: a.title,
            notes: a.notes,
            items: {
              create: a.items.map((it) => ({
                order: it.order,
                text: it.text,
                required: it.required,
                // When transferring, reset completion so the new employee starts fresh.
                done: false,
                doneAt: null,
              })),
            },
          },
        });
      }

      // Finally, remove assignments from requester so the task list "moves".
      await tx.taskAssignment.deleteMany({
        where: {
          companyId: reqRow.companyId,
          employeeId: reqRow.requesterEmployeeId,
          date: { gte: dayStart, lt: dayEnd },
        },
      });

      // 4) Cancel all other pending requests for that shift
      await tx.shiftChangeRequest.updateMany({
        where: {
          shiftId: shift.id,
          status: "PENDING",
          NOT: { id: reqRow.id },
        },
        data: { status: "CANCELLED", decidedAt: new Date() },
      });

      const notify = await tx.employee.findUnique({
        where: { id: reqRow.requesterEmployeeId },
        select: { email: true, firstName: true },
      });
      const candidate = await tx.employee.findUnique({
        where: { id: reqRow.candidateEmployeeId },
        select: { firstName: true, lastName: true },
      });

      return {
        ok: true as const,
        acceptedNotify:
          notify?.email
            ? {
                to: notify.email,
                requesterFirstName: notify.firstName,
                candidateName: `${candidate?.firstName ?? ""} ${candidate?.lastName ?? ""}`.trim() || "Un employé",
                shiftStart: shift.startTime,
                shiftEnd: shift.endTime,
              }
            : null,
      };
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    if (result.ok && "acceptedNotify" in result && result.acceptedNotify) {
      await sendShiftChangeAcceptedEmail(result.acceptedNotify);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // last-resort
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }
}