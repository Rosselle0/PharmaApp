// src/app/api/kiosk/logout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

  // Clear kiosk privilege cookies
  res.cookies.set("kiosk_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set("kiosk_unlock_exp", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set("kiosk_code", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  return res;
}
