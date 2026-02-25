// src/app/api/punch/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployeeFromKioskOrCode } from "@/lib/shiftChange/auth";
import { requireTerminalOrDev } from "@/lib/punch/terminalGuard";

const PunchTypes = [
  "CLOCK_IN",
  "CLOCK_OUT",
  "BREAK_START",
  "BREAK_END",
  "LUNCH_START",
  "LUNCH_END",
] as const;

type PunchType = (typeof PunchTypes)[number];

function isPunchType(x: unknown): x is PunchType {
  return typeof x === "string" && (PunchTypes as readonly string[]).includes(x);
}

function computeState(lastType: PunchType | null) {
  switch (lastType) {
    case "CLOCK_IN":
    case "BREAK_END":
    case "LUNCH_END":
      return "IN";
    case "BREAK_START":
      return "ON_BREAK";
    case "LUNCH_START":
      return "ON_LUNCH";
    case "CLOCK_OUT":
    default:
      return "OUT";
  }
}

export async function POST(req: Request) {
  const auth = await requireEmployeeFromKioskOrCode(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const terminal = await requireTerminalOrDev(req);
  if (!terminal.ok) return NextResponse.json({ ok: false, error: terminal.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type;

  if (!isPunchType(type)) {
    return NextResponse.json({ ok: false, error: "Type de punch invalide" }, { status: 400 });
  }

  const last = await prisma.punchEvent.findFirst({
    where: { employeeId: auth.employeeId },
    orderBy: { at: "desc" },
    select: { type: true, at: true },
  });

  const state = computeState((last?.type as PunchType | null) ?? null);

  const allowed: Record<ReturnType<typeof computeState>, PunchType[]> = {
    OUT: ["CLOCK_IN"],
    IN: ["BREAK_START", "LUNCH_START", "CLOCK_OUT"],
    ON_BREAK: ["BREAK_END"],
    ON_LUNCH: ["LUNCH_END"],
  };

  if (!allowed[state].includes(type)) {
    return NextResponse.json({ ok: false, error: `Action non permise dans l'état: ${state}` }, { status: 409 });
  }

  const now = new Date();

  await prisma.punchEvent.create({
    data: {
      employeeId: auth.employeeId,
      type,
      at: now,
      source: terminal.dev ? "WEB" : "WEB",
    },
  });

  return NextResponse.json({
    ok: true,
    state: computeState(type),
    punchedAt: now.toISOString(),
  });
}