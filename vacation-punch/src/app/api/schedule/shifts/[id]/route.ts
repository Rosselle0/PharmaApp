// src/app/api/schedule/shifts/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

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

export async function DELETE(_req: Request, ctx: Ctx) {
  const ok = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
