import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("kiosk_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set("kiosk_unlock_exp", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set("kiosk_code", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
