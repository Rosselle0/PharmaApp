export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingItem = { text: string; required?: boolean };

async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
    select: { id: true },
  });
  if (!company) throw new Error("Company not found. Seed Company first.");
  return company.id;
}

function startOfDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function nextDayUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
}

export async function POST(req: Request) {
  try {
    const companyId = await getCompanyId();
    const body = await req.json().catch(() => null);

    const employeeId = String(body?.employeeId ?? "").trim();
    const dateYMD = String(body?.date ?? "").trim();
    const templateId = body?.templateId ? String(body.templateId) : null;

    // notes is optional for both template and custom
    const notes = String(body?.notes ?? "").trim() || null;

    if (!employeeId || !dateYMD) {
      return NextResponse.json({ error: "employeeId + date required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYMD)) {
      return NextResponse.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
    }

    const dayStart = startOfDayUTC(dateYMD);
    const dayEnd = nextDayUTC(dateYMD);

    // Ensure employee exists in same company
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found for this company" }, { status: 404 });
    }

    // Build title + items
    let title = "";
    let items: { order: number; text: string; required: boolean }[] = [];

    if (templateId) {
      const tpl = await prisma.taskTemplate.findFirst({
        where: { id: templateId, companyId },
        include: { items: { orderBy: { order: "asc" } } },
      });
      if (!tpl) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      title = tpl.title;
      items = tpl.items.map((it) => ({
        order: it.order,
        text: it.text,
        required: it.required,
      }));

      // template assignment can be notes-only? no — template already has title/items.
      // notes is still allowed and saved.

    } else {
      // CUSTOM: allow any combination of title / notes / items
      title = String(body?.title ?? "").trim();

      const raw: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];
      items = raw
        .map((it, idx) => ({
          order: idx,
          text: String(it?.text ?? "").trim(),
          required: it?.required === false ? false : true,
        }))
        .filter((x) => x.text.length > 0);

      const hasTitle = title.length > 0;
      const hasItems = items.length > 0;
      const hasNotes = !!notes;

      if (!hasTitle && !hasItems && !hasNotes) {
        return NextResponse.json(
          { error: "Custom requires at least one of: title, notes, items" },
          { status: 400 }
        );
      }

      // If boss only writes notes and no title, give a sane default title.
      if (!hasTitle) title = "Tâches";
    }

    // If an assignment already exists for that employee+day, overwrite it
    const existing = await prisma.taskAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        date: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.taskAssignment.update({
          where: { id: existing.id },
          data: {
            title,
            notes, // ✅ UPDATE NOTES TOO
            items: {
              deleteMany: {},
              create: items.map((it) => ({
                order: it.order,
                text: it.text,
                required: it.required,
                done: false,
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        })
      : await prisma.taskAssignment.create({
          data: {
            companyId,
            employeeId,
            date: dayStart,
            title,
            notes, // ✅ SAVE NOTES
            items: {
              create: items.map((it) => ({
                order: it.order,
                text: it.text,
                required: it.required,
                done: false,
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        });

    return NextResponse.json({ assignment: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Assign failed" }, { status: 500 });
  }
}
