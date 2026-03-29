export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import { PunchType } from "@prisma/client";

const PUNCH_TYPES: PunchType[] = [
  "CLOCK_IN",
  "CLOCK_OUT",
  "BREAK_START",
  "BREAK_END",
  "LUNCH_START",
  "LUNCH_END",
];

async function loadShiftForCompany(shiftId: string, companyId: string) {
  return prisma.shift.findFirst({
    where: { id: shiftId, employee: { companyId } },
    select: { id: true, employeeId: true, startTime: true, endTime: true },
  });
}

async function punchesForShiftContext(shift: { id: string; employeeId: string; startTime: Date; endTime: Date }) {
  const linked = await prisma.punchEvent.findMany({
    where: { shiftId: shift.id, type: { in: PUNCH_TYPES } },
    orderBy: { at: "asc" },
  });
  if (linked.length) return linked;
  const from = new Date(shift.startTime.getTime() - 2 * 60 * 60 * 1000);
  const to = new Date(Math.max(shift.endTime.getTime(), Date.now()) + 12 * 60 * 60 * 1000);
  return prisma.punchEvent.findMany({
    where: {
      employeeId: shift.employeeId,
      at: { gte: from, lte: to },
      type: { in: PUNCH_TYPES },
    },
    orderBy: { at: "asc" },
  });
}

function sessionOpenWithoutOut(punches: { type: PunchType }[]) {
  let open = false;
  for (const p of punches) {
    if (p.type === "CLOCK_IN") open = true;
    if (p.type === "CLOCK_OUT") open = false;
  }
  return open;
}

export async function POST(req: Request) {
  try {
    const auth = await requirePrivilegedOrRedirect();
    const body = (await req.json().catch(() => null)) as
      | {
          action?: string;
          shiftId?: string;
          punchEventId?: string;
          atISO?: string;
        }
      | null;

    const action = String(body?.action ?? "");
    const companyId = auth.companyId;

    if (action === "FORCE_CLOCK_OUT") {
      const shiftId = String(body?.shiftId ?? "").trim();
      if (!shiftId) {
        return NextResponse.json({ ok: false, error: "shiftId requis." }, { status: 400 });
      }

      const shift = await loadShiftForCompany(shiftId, companyId);
      if (!shift) {
        return NextResponse.json({ ok: false, error: "Quart introuvable." }, { status: 404 });
      }

      const punches = await punchesForShiftContext(shift);
      if (!sessionOpenWithoutOut(punches)) {
        return NextResponse.json(
          { ok: false, error: "Impossible: entrée/sortie déjà complètes ou aucune entrée détectée." },
          { status: 400 }
        );
      }

      let at: Date;
      if (body?.atISO && String(body.atISO).trim()) {
        at = new Date(String(body.atISO));
        if (Number.isNaN(at.getTime())) {
          return NextResponse.json({ ok: false, error: "Date/heure invalide." }, { status: 400 });
        }
      } else {
        at = new Date();
      }

      const lastIn = [...punches].filter((p) => p.type === "CLOCK_IN").pop();
      if (lastIn && at.getTime() < lastIn.at.getTime()) {
        return NextResponse.json(
          { ok: false, error: "La sortie doit être après la dernière entrée." },
          { status: 400 }
        );
      }

      const created = await prisma.punchEvent.create({
        data: {
          employeeId: shift.employeeId,
          type: "CLOCK_OUT",
          source: "ADMIN",
          shiftId: shift.id,
          at,
        },
        select: { id: true, at: true },
      });

      await prisma.employee.update({
        where: { id: shift.employeeId },
        data: { punchKioskLocked: true },
      });

      await prisma.auditLog.create({
        data: {
          companyId,
          actorId: auth.userId,
          action: "ADMIN_FORCE_CLOCK_OUT",
          target: shift.id,
          meta: { shiftId: shift.id, punchEventId: created.id, at: created.at.toISOString() },
        },
      });

      return NextResponse.json({ ok: true, punch: created });
    }

    if (action === "UPDATE_PUNCH_AT") {
      const punchEventId = String(body?.punchEventId ?? "").trim();
      if (!punchEventId) {
        return NextResponse.json({ ok: false, error: "punchEventId requis." }, { status: 400 });
      }

      const atISO = String(body?.atISO ?? "").trim();
      if (!atISO) {
        return NextResponse.json({ ok: false, error: "atISO requis." }, { status: 400 });
      }

      const newAt = new Date(atISO);
      if (Number.isNaN(newAt.getTime())) {
        return NextResponse.json({ ok: false, error: "Date/heure invalide." }, { status: 400 });
      }

      const existing = await prisma.punchEvent.findFirst({
        where: { id: punchEventId },
        select: {
          id: true,
          type: true,
          at: true,
          shiftId: true,
          employeeId: true,
          employee: { select: { companyId: true } },
        },
      });

      if (!existing || existing.employee.companyId !== companyId) {
        return NextResponse.json({ ok: false, error: "Pointage introuvable." }, { status: 404 });
      }

      if (existing.type !== "CLOCK_IN" && existing.type !== "CLOCK_OUT") {
        return NextResponse.json(
          { ok: false, error: "Seuls entrée et sortie peuvent être modifiés." },
          { status: 400 }
        );
      }

      const shift =
        existing.shiftId &&
        (await loadShiftForCompany(existing.shiftId, companyId));

      let ctxPunches = shift
        ? await punchesForShiftContext(shift)
        : await prisma.punchEvent.findMany({
            where: {
              employeeId: existing.employeeId,
              at: {
                gte: new Date(newAt.getTime() - 24 * 60 * 60 * 1000),
                lte: new Date(newAt.getTime() + 24 * 60 * 60 * 1000),
              },
              type: { in: PUNCH_TYPES },
            },
            orderBy: { at: "asc" },
          });

      type PRow = { id: string; type: PunchType; at: Date };
      const merged: PRow[] = [
        ...ctxPunches.filter((p) => p.id !== existing.id).map((p) => ({ id: p.id, type: p.type, at: p.at })),
        { id: existing.id, type: existing.type, at: newAt },
      ].sort((a, b) => a.at.getTime() - b.at.getTime());

      const idx = merged.findIndex((p) => p.id === existing.id);
      if (idx < 0) {
        return NextResponse.json({ ok: false, error: "Contexte de pointage invalide." }, { status: 400 });
      }

      const prevOut = [...merged.slice(0, idx)].reverse().find((p) => p.type === "CLOCK_OUT") ?? null;
      const prevIn = [...merged.slice(0, idx)].reverse().find((p) => p.type === "CLOCK_IN") ?? null;
      const nextIn = merged.slice(idx + 1).find((p) => p.type === "CLOCK_IN") ?? null;
      const nextOut = merged.slice(idx + 1).find((p) => p.type === "CLOCK_OUT") ?? null;

      if (existing.type === "CLOCK_IN") {
        if (prevOut && newAt.getTime() <= prevOut.at.getTime()) {
          return NextResponse.json(
            { ok: false, error: "L'entrée doit être après la sortie précédente." },
            { status: 400 }
          );
        }
        if (nextOut && newAt.getTime() >= nextOut.at.getTime()) {
          return NextResponse.json(
            { ok: false, error: "L'entrée doit être avant la sortie suivante." },
            { status: 400 }
          );
        }
      } else {
        if (prevIn && newAt.getTime() <= prevIn.at.getTime()) {
          return NextResponse.json(
            { ok: false, error: "La sortie doit être après l'entrée." },
            { status: 400 }
          );
        }
        if (nextIn && newAt.getTime() >= nextIn.at.getTime()) {
          return NextResponse.json(
            { ok: false, error: "La sortie doit être avant l'entrée suivante." },
            { status: 400 }
          );
        }
      }

      const oldAt = existing.at;
      await prisma.punchEvent.update({
        where: { id: existing.id },
        data: { at: newAt },
      });

      await prisma.auditLog.create({
        data: {
          companyId,
          actorId: auth.userId,
          action: "PUNCH_TIME_CORRECTED",
          target: existing.id,
          meta: {
            punchEventId: existing.id,
            type: existing.type,
            oldAt: oldAt.toISOString(),
            newAt: newAt.toISOString(),
          },
        },
      });

      return NextResponse.json({ ok: true, id: existing.id, at: newAt.toISOString() });
    }

    return NextResponse.json({ ok: false, error: "Action inconnue." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erreur serveur" }, { status: 500 });
  }
}
