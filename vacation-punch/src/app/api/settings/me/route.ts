export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").replace(/\D/g, "");

    if (!/^\d{8}$/.test(code)) {
      return NextResponse.json(
        { ok: false, error: "Invalid code (expected 8 digits)" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { firstName: true, lastName: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
    }

    const employeeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();

    return NextResponse.json({
      ok: true,
      employeeName: employeeName || "EMPLOYEE",
    });
  } catch (e: any) {
    console.error("GET /api/settings/me failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
