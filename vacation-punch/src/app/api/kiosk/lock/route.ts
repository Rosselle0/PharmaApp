// src/app/api/kiosk/lock/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const sid = store.get("kiosk_session")?.value;

  // best effort cleanup
  if (sid) {
    await prisma.kioskSession.delete({ where: { id: sid } }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set("kiosk_session", "", { httpOnly: true, path: "/", expires: new Date(0) });
  res.cookies.set("kiosk_code", "", { httpOnly: true, path: "/", expires: new Date(0) });

  return res;
}
