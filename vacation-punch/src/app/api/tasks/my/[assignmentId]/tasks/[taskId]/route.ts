export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { assignmentId: string; taskId: string };
type Ctx = { params: Promise<Params> }; // <-- KEY: params is a Promise in your Next

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { assignmentId, taskId } = await ctx.params; // <-- KEY: await it

    console.log("PATCH params =", { assignmentId, taskId });

    if (!assignmentId || !taskId) {
      return NextResponse.json(
        { error: `Missing params: assignmentId=${assignmentId} taskId=${taskId}` },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const nextDone = Boolean(body?.done);

    // safety: ensure item belongs to that assignment
    const existing = await prisma.taskAssignmentItem.findFirst({
      where: { id: taskId, assignmentId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Task not found for this assignment." },
        { status: 404 }
      );
    }

    const updated = await prisma.taskAssignmentItem.update({
      where: { id: taskId },
      data: {
        done: nextDone,
        doneAt: nextDone ? new Date() : null,
      },
      select: { id: true, done: true, doneAt: true },
    });

    return NextResponse.json({ task: updated });
  } catch (e: any) {
    console.error("PATCH task failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
