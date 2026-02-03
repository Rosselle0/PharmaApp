export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfDayUTC(ymd: string) {
  // ymd = "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function nextDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").replace(/\D/g, "");
    const ymd = (url.searchParams.get("date") ?? "").slice(0, 10);

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }
    if (!/^\d{8}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code (expected 8 digits)" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return NextResponse.json({ error: "Missing/invalid date" }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!employee) {
      return NextResponse.json({ assignments: [] });
    }

    const dayStart = startOfDayUTC(ymd);
    const dayEnd = nextDayUTC(ymd);

    const rows = await prisma.taskAssignment.findMany({
      where: {
        employeeId: employee.id,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    // Normalize to what your TaskListPage expects: assignments[].tasks
    const assignments = rows.map((a) => ({
      id: a.id,
      dateYMD: a.date.toISOString().slice(0, 10),
      startHHMM: null,
      endHHMM: null,
      title: a.title ?? "Tâches",
      tasks: a.items.map((it) => ({
        id: it.id,
        text: it.text,
        done: it.done,
        required: it.required,
      })),
    }));

    return NextResponse.json({ assignments });
  } catch (e: any) {
    console.error("GET /api/tasks/my failed:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
