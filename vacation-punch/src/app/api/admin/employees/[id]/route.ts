export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role, Department } from "@prisma/client";

async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return { ok: false as const, status: 401 as const };

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true, companyId: true },
  });

  if (!me) return { ok: false as const, status: 403 as const };
  if (me.role !== Role.ADMIN && me.role !== Role.MANAGER)
    return { ok: false as const, status: 403 as const };

  return { ok: true as const, companyId: me.companyId };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: gate.status });

  const body = await req.json().catch(() => null);

  const data: any = {};
  if (body?.firstName != null) data.firstName = String(body.firstName).trim();
  if (body?.lastName != null) data.lastName = String(body.lastName).trim();
  if (body?.paidBreak30 != null) data.paidBreak30 = Boolean(body.paidBreak30);
  if (body?.department != null) data.department = body.department as Department;

  if (body?.employeeCode != null) {
    const code = String(body.employeeCode).trim();
    if (!/^\d{3,10}$/.test(code)) {
      return NextResponse.json({ error: "Invalid employeeCode" }, { status: 400 });
    }
    data.employeeCode = code;
  }

  const updated = await prisma.employee.updateMany({
    where: { id: params.id, companyId: gate.companyId },
    data,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: gate.status });

  const deleted = await prisma.employee.deleteMany({
    where: { id: params.id, companyId: gate.companyId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
