// src/app/api/schedule/shifts/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function isWithinHours(d: Date) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 8 && h <= 21;
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true },
  });
  if (!me || me.role !== "ADMIN") return null;
  return true;
}

export async function POST(req: Request) {
  const ok = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const employeeId = String(body.employeeId ?? "");
  const startTime = new Date(String(body.startTime ?? ""));
  const endTime = new Date(String(body.endTime ?? ""));
  const note = body.note === null ? null : String(body.note ?? "").trim() || null;

  if (!employeeId || Number.isNaN(+startTime) || Number.isNaN(+endTime)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (+endTime <= +startTime) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }
  if (!isWithinHours(startTime) || !isWithinHours(endTime)) {
    return NextResponse.json({ error: "Allowed range is 08:00–21:00" }, { status: 400 });
  }

  // MVP rule: 1 shift per employee per day
  const dayKey = ymdLocal(startTime);

  const existing = await prisma.shift.findFirst({
    where: {
      employeeId,
      status: "PLANNED",
      // same day (local-ish). simplest: compare date strings by startTime
      // we'll filter by >= dayStart and < nextDayStart
      startTime: {
        gte: new Date(dayKey + "T00:00:00"),
        lt: new Date(dayKey + "T23:59:59"),
      },
    },
    select: { id: true },
  });

  const shift = existing
    ? await prisma.shift.update({
        where: { id: existing.id },
        data: { startTime, endTime, note },
        select: { id: true, employeeId: true, startTime: true, endTime: true, note: true },
      })
    : await prisma.shift.create({
        data: { employeeId, startTime, endTime, note, status: "PLANNED" },
        select: { id: true, employeeId: true, startTime: true, endTime: true, note: true },
      });

  return NextResponse.json({ shift });
}
