export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTerminalIpCheck, requireTerminalOrDev } from "@/lib/punch/terminalGuard";

export async function GET(req: Request) {
  const check = getTerminalIpCheck(req);

  const jar = await cookies();
  const sid = jar.get("terminal_session")?.value ?? "";

  const guard = await requireTerminalOrDev(req);

  return NextResponse.json(
    {
      ok: true,
      ipCheck: check,
      terminalSessionCookiePresent: Boolean(sid),
      terminalSessionCookieLength: sid.length,
      guard,
    },
    { status: 200 }
  );
}

