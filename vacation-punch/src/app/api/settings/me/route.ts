export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messageFromUnknown } from "@/lib/unknownError";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").replace(/\D/g, "");

    if (!/^\d{4,}$/.test(code)) {
      return NextResponse.json(
        { ok: false, error: "Invalid code (expected at least 4 digits)" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { firstName: true, lastName: true, email: true, role: true, profilePhotoDataUrl: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
    }

    const employeeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();

    return NextResponse.json({
      ok: true,
      employeeName: employeeName || "EMPLOYEE",
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      email: employee.email ?? null,
      role: employee.role ?? null,
      profilePhotoDataUrl: employee.profilePhotoDataUrl ?? null,
    });
  } catch (e: unknown) {
    console.error("GET /api/settings/me failed:", e);
    return NextResponse.json(
      { ok: false, error: messageFromUnknown(e) || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      code?: string;
      profilePhotoDataUrl?: string | null;
    } | null;

    const code = String(body?.code ?? "").replace(/\D/g, "");
    if (!/^\d{4,}$/.test(code)) {
      return NextResponse.json(
        { ok: false, error: "Invalid code (expected at least 4 digits)" },
        { status: 400 }
      );
    }

    const raw = body?.profilePhotoDataUrl;
    const profilePhotoDataUrl = typeof raw === "string" ? raw.trim() : null;
    if (profilePhotoDataUrl && profilePhotoDataUrl.length > 1_000_000) {
      return NextResponse.json(
        { ok: false, error: "Image trop volumineuse (max 1MB)." },
        { status: 400 }
      );
    }

    await prisma.employee.update({
      where: { employeeCode: code },
      data: { profilePhotoDataUrl: profilePhotoDataUrl || null },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("POST /api/settings/me failed:", e);
    return NextResponse.json(
      { ok: false, error: messageFromUnknown(e) || "Server error" },
      { status: 500 }
    );
  }
}
