export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = {
  params: {
    id: string;
  };
};

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const id = params.id;

    const body = await req.json();

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        employeeCode: body.employeeCode,
        department: body.department,
        paidBreak30: Boolean(body.paidBreak30),
        isActive: body.isActive,
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

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await prisma.employee.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
