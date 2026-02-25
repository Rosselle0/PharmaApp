export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const secret = String(body?.terminalSecret || "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "Code requis" }, { status: 400 });

  const secretHash = sha256(secret);

  const terminal = await prisma.kioskTerminal.findFirst({
    where: { secretHash, isActive: true },
    select: { id: true, companyId: true },
  });

  if (!terminal) return NextResponse.json({ ok: false, error: "Code invalide" }, { status: 401 });

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

  const session = await prisma.kioskTerminalSession.create({
    data: { terminalId: terminal.id, expiresAt },
    select: { id: true },
  });

  const jar = await cookies();
  jar.set("terminal_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return NextResponse.json({ ok: true });
}