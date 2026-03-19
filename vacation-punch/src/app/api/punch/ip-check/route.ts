export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTerminalIpCheck } from "@/lib/punch/terminalGuard";

export async function GET(req: Request) {
  const xForwardedFor = req.headers.get("x-forwarded-for") ?? null;
  const xRealIp = req.headers.get("x-real-ip") ?? null;
  const xForwardedProto = req.headers.get("x-forwarded-proto") ?? null;

  const check = getTerminalIpCheck(req);

  return NextResponse.json(
    {
      ok: true,
      ...check,
      headers: {
        "x-forwarded-for": xForwardedFor,
        "x-real-ip": xRealIp,
        "x-forwarded-proto": xForwardedProto,
      },
    },
    { status: 200 }
  );
}

