import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));

  // MVP: just require a numeric code. Replace with DB validation later.
  const clean = String(code ?? "").replace(/\D/g, "").slice(0, 10);
  if (!clean) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const exp = Date.now() + 1000 * 60 * 60 * 8; // 8 hours

  const res = NextResponse.json({ ok: true });
  res.cookies.set("kiosk_unlock_exp", String(exp), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // optional: store the code too (NOT secure, but useful)
  res.cookies.set("kiosk_code", clean, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
