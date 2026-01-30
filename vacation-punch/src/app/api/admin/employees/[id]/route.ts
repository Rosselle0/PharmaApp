export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        firstName: String(body.firstName ?? "").trim(),
        lastName: String(body.lastName ?? "").trim(),
        employeeCode: String(body.employeeCode ?? "").trim(),
        department: body.department, // must match your Prisma enum
        paidBreak30: Boolean(body.paidBreak30),
        isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
      },
    });

    return NextResponse.json({ employee: updated });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "Employee code already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    await prisma.employee.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
