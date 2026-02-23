// src/app/api/schedule/shifts/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";

type Ctx = { params: Promise<{ id: string }> };

async function getDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME?.trim() || "RxPlanning";
  const company = await prisma.company.upsert({
    where: { name: companyName },
    create: { name: companyName },
    update: {},
    select: { id: true },
  });
  return company.id;
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireKioskManagerOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const shiftId = String(id ?? "").trim();
  if (!shiftId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Best: auth.companyId. If your guard doesn't return it, fall back to your default company.
  const companyId = (auth as any).companyId ?? (await getDefaultCompanyId());

  // ✅ scope check: shift must belong to this company
  const shift = await prisma.shift.findFirst({
    where: {
      id: shiftId,
      employee: { is: { companyId } },
    },
    select: { id: true },
  });

  if (!shift) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.shift.delete({ where: { id: shiftId } });

  return NextResponse.json({ ok: true });
}