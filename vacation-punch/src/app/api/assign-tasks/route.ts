export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingItem = { text: string; required?: boolean };

async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
  });
  if (!company) throw new Error("Company not found. Seed Company first.");
  return company.id;
}

function toDayBounds(dateYMD: string) {
  // dateYMD: "YYYY-MM-DD"
  const start = new Date(dateYMD); // treated as UTC midnight in Node
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function POST(req: Request) {
  try {
    const companyId = await getCompanyId();
    const body = await req.json().catch(() => null);

    const employeeId: string = String(body?.employeeId ?? "").trim();
    const dateYMD: string = String(body?.date ?? "").trim();
    const templateId: string | null = body?.templateId ? String(body.templateId) : null;

    if (!employeeId || !dateYMD) {
      return NextResponse.json({ error: "employeeId + date required" }, { status: 400 });
    }

    const { start, end } = toDayBounds(dateYMD);

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
    } else {
      // custom payload
      title = String(body?.title ?? "").trim();
      const raw: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];

      items = raw
        .map((it, idx) => ({
          order: idx,
          text: String(it?.text ?? "").trim(),
          required: it?.required === false ? false : true,
        }))
        .filter((x) => x.text.length > 0);

      if (!title || items.length === 0) {
        return NextResponse.json({ error: "Custom requires title + items" }, { status: 400 });
      }
    }

    // If an assignment already exists for that employee+day, overwrite it (simple + practical)
    const existing = await prisma.taskAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        date: { gte: start, lt: end },
      },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.taskAssignment.update({
          where: { id: existing.id },
          data: {
            title,
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
            date: start,
            title,
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
