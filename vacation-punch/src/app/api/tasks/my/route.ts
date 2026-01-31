export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
  });
  if (!company) throw new Error("Company not found. Seed Company first.");
  return company.id;
}

function toDayBounds(dateYMD: string) {
  const start = new Date(dateYMD);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);

    const code = String(searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, 4);
    const dateYMD = String(searchParams.get("date") ?? "").trim();

    if (!code || code.length !== 4) {
      return NextResponse.json({ error: "Missing/invalid code" }, { status: 400 });
    }
    if (!dateYMD) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const employee = await prisma.employee.findFirst({
      where: { companyId, employeeCode: code, isActive: true },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });

    if (!employee) {
      return NextResponse.json({ assignments: [], employee: null });
    }

    const { start, end } = toDayBounds(dateYMD);

    const assignment = await prisma.taskAssignment.findFirst({
      where: {
        companyId,
        employeeId: employee.id,
        date: { gte: start, lt: end },
      },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();

    return NextResponse.json({
      employee: { name: employeeName, code: employee.employeeCode },
      assignments: assignment ? [assignment] : [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Load failed" }, { status: 500 });
  }
}
