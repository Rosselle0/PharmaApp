import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();

  const expected = process.env.PUNCH_KIOSK_CODE;
  if (!expected) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  if (code !== expected) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const minutes = Number(process.env.PUNCH_KIOSK_UNLOCK_MINUTES ?? "480");
  const exp = Date.now() + minutes * 60_000;

  const cookieStore = await cookies();
  cookieStore.set("kiosk_unlock_exp", String(exp), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: minutes * 60,
  });

  return NextResponse.json({ ok: true, expiresAt: exp });
}
