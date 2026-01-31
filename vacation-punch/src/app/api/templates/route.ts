export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ---------------- TYPES ---------------- */

type IncomingItem = {
  text: string;
  required?: boolean;
};

/* ---------------- HELPERS ---------------- */

async function getCompanyId() {
  const company = await prisma.company.findFirst({
    where: { name: process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning" },
  });

  if (!company) {
    throw new Error("Company not found. Seed Company first.");
  }

  return company.id;
}

/* ---------------- GET (list templates) ---------------- */

export async function GET() {
  try {
    const companyId = await getCompanyId();

    const templates = await prisma.taskTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({ templates });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Failed to load templates" },
      { status: 500 }
    );
  }
}

/* ---------------- POST (create or update) ---------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyId = await getCompanyId();

    const templateId: string | undefined = body.id;
    const title: string = String(body.title ?? "").trim();
    const rawItems: IncomingItem[] = Array.isArray(body.items)
      ? body.items
      : [];

    if (!title || rawItems.length === 0) {
      return NextResponse.json(
        { error: "Title and at least one task required" },
        { status: 400 }
      );
    }

    // normalize items
    const items = rawItems
      .map((it, idx) => ({
        order: idx,
        text: String(it.text ?? "").trim(),
        required: it.required === false ? false : true,
      }))
      .filter((x) => x.text.length > 0);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "All tasks are empty" },
        { status: 400 }
      );
    }

    /* -------- UPDATE -------- */
    if (templateId) {
      const updated = await prisma.taskTemplate.update({
        where: { id: templateId },
        data: {
          title,
          items: {
            deleteMany: {},
            create: items,
          },
        },
        include: {
          items: { orderBy: { order: "asc" } },
        },
      });

      return NextResponse.json({ template: updated });
    }

    /* -------- CREATE -------- */
    const created = await prisma.taskTemplate.create({
      data: {
        companyId,
        title,
        items: {
          create: items,
        },
      },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({ template: created });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Template save failed" },
      { status: 500 }
    );
  }
}

/* ---------------- DELETE ---------------- */

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Template id required" },
        { status: 400 }
      );
    }

    await prisma.taskTemplate.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
