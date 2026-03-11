// src/app/api/kiosk/logout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value ?? null;

  if (sessionId) {
    try {
      await prisma.kioskSession.delete({
        where: { id: sessionId },
      });
    } catch {
      // ignore if already gone
    }
  }

  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );

  // clear the real DB-backed kiosk session cookie
  res.cookies.set("kiosk_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // clear old kiosk cookies too, since your codebase still mixes systems
  res.cookies.set("kiosk_role", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set("kiosk_unlock_exp", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set("kiosk_code", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}