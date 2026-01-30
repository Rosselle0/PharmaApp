// src/app/api/schedule/shifts/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const TZ = process.env.APP_TZ || "America/Toronto"; // Montreal/Toronto timezone

function timePartsInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
  return { hh, mm };
}

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD in en-CA
}

function isWithinHoursTZ(d: Date) {
  const { hh, mm } = timePartsInTZ(d);
  const h = hh + mm / 60;
  return h >= 8 && h <= 21;
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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const employeeId = String(body.employeeId ?? "");
  if (!employeeId) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // ✅ Accept BOTH formats:
  // A) startTime/endTime ISO (recommended)
  // B) dayISO + startHHMM/endHHMM (fallback)
  let startTime: Date | null = null;
  let endTime: Date | null = null;

  if (body.startTime && body.endTime) {
    startTime = new Date(String(body.startTime));
    endTime = new Date(String(body.endTime));
  } else if (body.dayISO && body.startHHMM && body.endHHMM) {
    const dayISO = String(body.dayISO);
    const st = String(body.startHHMM);
    const en = String(body.endHHMM);

    const m1 = /^(\d{1,2}):(\d{2})$/.exec(st.trim());
    const m2 = /^(\d{1,2}):(\d{2})$/.exec(en.trim());
    if (!m1 || !m2) return NextResponse.json({ error: "Invalid time format" }, { status: 400 });

    const base = new Date(dayISO);
    if (Number.isNaN(+base)) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const sh = Number(m1[1]), sm = Number(m1[2]);
    const eh = Number(m2[1]), em = Number(m2[2]);

    // Build using the SAME instant base day, then set hours in SERVER local
    // (validation uses TZ so this is safe)
    startTime = new Date(base);
    endTime = new Date(base);
    startTime.setHours(sh, sm, 0, 0);
    endTime.setHours(eh, em, 0, 0);
  } else {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (!startTime || !endTime || Number.isNaN(+startTime) || Number.isNaN(+endTime)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const note = body.note === null ? null : String(body.note ?? "").trim() || null;

  if (+endTime <= +startTime) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  // ✅ Timezone-safe validation (works on Vercel UTC)
  if (!isWithinHoursTZ(startTime) || !isWithinHoursTZ(endTime)) {
    return NextResponse.json({ error: "Allowed range is 08:00–21:00" }, { status: 400 });
  }

  // ✅ 1 shift per employee per local day (TZ-safe)
  const dayKey = ymdInTZ(startTime);

  // Use a safe range query: [dayStart, nextDayStart) in TZ by converting via Intl is hard.
  // So we match by dayKey using a broader range and then verify in code.
  // Pragmatic MVP: fetch shifts in +/- 36h window and compare dayKey in TZ.
  const windowStart = new Date(startTime.getTime() - 36 * 3600 * 1000);
  const windowEnd = new Date(startTime.getTime() + 36 * 3600 * 1000);

  const candidates = await prisma.shift.findMany({
    where: {
      employeeId,
      status: "PLANNED",
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, startTime: true },
  });

  const existing = candidates.find((s) => ymdInTZ(new Date(s.startTime)) === dayKey);

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
