// src/app/api/schedule/export/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = process.env.APP_TZ || "America/Toronto";
const DAY_LABELS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEND", "SAM"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymdLocal(d: Date) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hmLocal(d: Date) {
  return d.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

function dayNum(d: Date) {
  return d.toLocaleDateString("fr-CA", {
    day: "numeric",
    timeZone: TZ,
  });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("fr-CA", {
    month: "long",
    timeZone: TZ,
  });
}

function hoursBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

function fmtHours(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return new Intl.NumberFormat("fr-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);
}

async function getDefaultCompany() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  return (
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }))
  );
}

type ShiftLite = {
  employeeId: string;
  startTime: Date;
  endTime: Date;
  note: string | null;
};

type EmployeeLite = {
  id: string;
  firstName: string;
  lastName: string;
};

function buildShiftMap(shifts: ShiftLite[]) {
  const map = new Map<string, ShiftLite[]>();

  for (const s of shifts) {
    const key = `${s.employeeId}:${ymdLocal(new Date(s.startTime))}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }

  return map;
}

function drawWeekTable(
  doc: PDFKit.PDFDocument,
  opts: {
    weekStart: Date;
    employees: EmployeeLite[];
    byUserDay: Map<string, ShiftLite[]>;
    topY: number;
  }
) {
  const { weekStart, employees, byUserDay, topY } = opts;

  const left = 36;
  const top = topY;
  const nameW = 96;
  const dayW = 62;
  const totalW = 64;
  const headerH = 26;
  const rowH = 22;

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const tableWidth = nameW + 7 * dayW + totalW;

  doc.font("Helvetica-Bold").fontSize(12).text("Horaire", left, top - 22, {
    width: tableWidth,
    align: "center",
  });

  doc.rect(left, top, tableWidth, headerH * 2 + rowH * employees.length).stroke();

  let x = left;
  const widths = [nameW, ...Array(7).fill(dayW), totalW];
  for (const w of widths) {
    doc
      .moveTo(x, top)
      .lineTo(x, top + headerH * 2 + rowH * employees.length)
      .stroke();
    x += w;
  }
  doc
    .moveTo(x, top)
    .lineTo(x, top + headerH * 2 + rowH * employees.length)
    .stroke();

  doc.moveTo(left, top + headerH).lineTo(left + tableWidth, top + headerH).stroke();
  doc
    .moveTo(left, top + headerH * 2)
    .lineTo(left + tableWidth, top + headerH * 2)
    .stroke();

  for (let i = 0; i <= employees.length; i++) {
    const yy = top + headerH * 2 + i * rowH;
    doc.moveTo(left, yy).lineTo(left + tableWidth, yy).stroke();
  }

  let cx = left + nameW;
  for (let i = 0; i < 7; i++) {
    doc.font("Helvetica-Bold").fontSize(10).text(DAY_LABELS[i], cx, top + 7, {
      width: dayW,
      align: "center",
    });
    cx += dayW;
  }

  doc.font("Helvetica-Bold").fontSize(10).text("TOTAL", left + nameW + 7 * dayW, top + 7, {
    width: totalW,
    align: "center",
  });

  doc.font("Helvetica").fontSize(10).text(monthLabel(weekStart), left + 6, top + headerH + 6, {
    width: nameW - 12,
    align: "left",
  });

  cx = left + nameW;
  for (let i = 0; i < 7; i++) {
    doc.font("Helvetica-Bold").fontSize(10).text(dayNum(days[i]), cx, top + headerH + 6, {
      width: dayW,
      align: "center",
    });
    cx += dayW;
  }

  employees.forEach((emp, rowIdx) => {
    const y = top + headerH * 2 + rowIdx * rowH + 6;
    const fullName = `${emp.firstName} ${emp.lastName}`;

    doc.font("Helvetica").fontSize(10).text(fullName, left + 6, y, {
      width: nameW - 10,
      ellipsis: true,
    });

    let weeklyTotal = 0;

    days.forEach((d, i) => {
      const key = `${emp.id}:${ymdLocal(d)}`;
      const list = byUserDay.get(key) ?? [];

      const text = list
        .map((sh) => {
          if (sh.note === "VAC") return "VAC";
          weeklyTotal += hoursBetween(new Date(sh.startTime), new Date(sh.endTime));
          return `${hmLocal(new Date(sh.startTime))}-${hmLocal(new Date(sh.endTime))}`;
        })
        .join(" / ");

      doc.font("Helvetica").fontSize(9).text(text, left + nameW + i * dayW + 3, y, {
        width: dayW - 6,
        align: "center",
        ellipsis: true,
      });
    });

    doc.font("Helvetica-Bold").fontSize(10).text(
      fmtHours(weeklyTotal),
      left + nameW + 7 * dayW,
      y,
      {
        width: totalW,
        align: "center",
      }
    );
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const week = String(url.searchParams.get("week") ?? "").trim();

  const base = week ? new Date(`${week}T12:00:00`) : new Date();
  const week1 = startOfWeek(base);
  const week2 = addDays(week1, 7);
  const end = addDays(week1, 14);

  const company = await getDefaultCompany();
  const companyId = company.id;

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      AND: [{ startTime: { lt: end } }, { endTime: { gt: week1 } }],
    },
    orderBy: [{ startTime: "asc" }],
    select: { employeeId: true, startTime: true, endTime: true, note: true },
  });

  const week1Shifts = shifts.filter(
    (s) => new Date(s.startTime) < week2 && new Date(s.endTime) > week1
  );
  const week2Shifts = shifts.filter(
    (s) => new Date(s.startTime) < end && new Date(s.endTime) > week2
  );

  const byUserDay1 = buildShiftMap(week1Shifts);
  const byUserDay2 = buildShiftMap(week2Shifts);

  const { default: PDFDocument } = await import("pdfkit");

  const doc = new PDFDocument({
    size: "A4",
    margin: 24,
    layout: "landscape",
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfDone = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawWeekTable(doc, {
    weekStart: week1,
    employees,
    byUserDay: byUserDay1,
    topY: 48,
  });

  drawWeekTable(doc, {
    weekStart: week2,
    employees,
    byUserDay: byUserDay2,
    topY: 380,
  });

  doc.end();

  const pdf = await pdfDone;
  const fileName = `horaire-${ymdLocal(week1)}-to-${ymdLocal(addDays(week2, 6))}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}