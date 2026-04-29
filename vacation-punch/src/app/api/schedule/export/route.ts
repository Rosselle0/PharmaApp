// src/app/api/schedule/export/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Department, ShiftStatus } from "@prisma/client";
import { unpaidBreak30DeductionMinutes } from "@/lib/unpaidBreak30";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = process.env.APP_TZ || "America/Toronto";
const DAY_LABELS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEND", "SAM"];

const COLORS = {
  text: "#111111",
  grid: "#555555",
  outer: "#222222",
};

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

function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function hmCompact(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return minute === "00" ? `${Number(hour)}` : `${Number(hour)}${minute}`;
}

function formatShiftRange(start: Date, end: Date) {
  return `${hmCompact(start)}-${hmCompact(end)}`;
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

function monthSpanLabel(start: Date, end: Date) {
  const a = monthLabel(start);
  const b = monthLabel(end);
  return a === b ? a : `${a}-${b}`;
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
  paidBreak30: boolean;
};

function buildShiftMap(shifts: ShiftLite[]) {
  const map = new Map<string, ShiftLite[]>();

  for (const s of shifts) {
    const key = `${s.employeeId}:${ymdInTZ(new Date(s.startTime))}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }

  return map;
}

function fitText(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize = 6
) {
  let size = baseSize;
  doc.fontSize(size);

  while (size > minSize && doc.widthOfString(text) > maxWidth) {
    size -= 0.25;
    doc.fontSize(size);
  }

  return size;
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string,
  fontSize: number,
  align: "left" | "center" | "right" = "center"
) {
  doc
    .font(font)
    .fontSize(fontSize)
    .fillColor(COLORS.text)
    .text(text, x, y, {
      width,
      align,
      lineBreak: false,
      ellipsis: true,
    });
}

function drawWeekTable(
  doc: PDFKit.PDFDocument,
  opts: {
    weekStart: Date;
    employees: EmployeeLite[];
    byUserDay: Map<string, ShiftLite[]>;
    topY: number;
    showTitle?: boolean;
  }
) {
  const { weekStart, employees, byUserDay, topY, showTitle = false } = opts;

  const pageWidth = doc.page.width;
  const top = topY;
  const maxTableHeight = 320;

  // proportions closer to the scanned sheet
  const nameW = 88;
  const dayW = 60;
  const totalW = 64;
  const headerH = 25;
  const dataRows = Math.max(1, employees.length + 1); // +1 footer row for weekly total
  const rowH = Math.max(10, Math.min(21, (maxTableHeight - headerH * 2) / dataRows));
  const scale = rowH / 21;

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const tableWidth = nameW + 7 * dayW + totalW;
  const tableHeight = headerH * 2 + rowH * dataRows;
  const left = (pageWidth - tableWidth) / 2;

  // single title only
  if (showTitle) {
    drawCellText(doc, "Horaire", left, 16, tableWidth, "Helvetica-Bold", 14, "center");
  }

  // outer border
  doc.save();
  doc.lineWidth(0.9).strokeColor(COLORS.outer).rect(left, top, tableWidth, tableHeight).stroke();
  doc.restore();

  // grid lines
  doc.save();
  doc.lineWidth(0.45).strokeColor(COLORS.grid);

  let x = left;
  const widths = [nameW, ...Array(7).fill(dayW), totalW];
  for (const w of widths) {
    doc.moveTo(x, top).lineTo(x, top + tableHeight).stroke();
    x += w;
  }
  doc.moveTo(x, top).lineTo(x, top + tableHeight).stroke();

  doc.moveTo(left, top + headerH).lineTo(left + tableWidth, top + headerH).stroke();
  doc.moveTo(left, top + headerH * 2).lineTo(left + tableWidth, top + headerH * 2).stroke();

  for (let i = 0; i <= dataRows; i++) {
    const yy = top + headerH * 2 + i * rowH;
    doc.moveTo(left, yy).lineTo(left + tableWidth, yy).stroke();
  }

  doc.restore();

  // top header
  let cx = left + nameW;
  for (let i = 0; i < 7; i++) {
    drawCellText(doc, DAY_LABELS[i], cx, top + 6, dayW, "Helvetica-Bold", Math.max(7.1, 9.6 * scale), "center");
    cx += dayW;
  }

  drawCellText(
    doc,
    "TOTAL",
    left + nameW + 7 * dayW,
    top + 6,
    totalW,
    "Helvetica-Bold",
    Math.max(7.1, 9.6 * scale),
    "center"
  );

  // second header row
  drawCellText(
    doc,
    monthSpanLabel(days[0], days[6]),
    left + 6,
    top + headerH + 4.5,
    nameW - 10,
    "Helvetica-Bold",
    Math.max(7.1, 9.2 * scale),
    "left"
  );

  cx = left + nameW;
  for (let i = 0; i < 7; i++) {
    drawCellText(doc, dayNum(days[i]), cx, top + headerH + 4.5, dayW, "Helvetica-Bold", Math.max(7.1, 9.2 * scale), "center");
    cx += dayW;
  }

  // rows
  let weekGrandTotal = 0;
  employees.forEach((emp, rowIdx) => {
    const y = top + headerH * 2 + rowIdx * rowH + 4.5;
    const fullName = emp.firstName;

    drawCellText(doc, fullName, left + 4, y, nameW - 8, "Helvetica", Math.max(7, 9 * scale), "left");

    let weeklyTotal = 0;

    days.forEach((d, i) => {
      const key = `${emp.id}:${ymdInTZ(d)}`;
      const list = byUserDay.get(key) ?? [];

      const text = list
        .map((sh) => {
          if (sh.note === "VAC") return "VAC";
          const start = new Date(sh.startTime);
          const end = new Date(sh.endTime);
          const grossMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
          const rawHours = hoursBetween(start, end);
          const deductionMinutes = unpaidBreak30DeductionMinutes(emp.paidBreak30, grossMinutes);
          weeklyTotal += Math.max(0, rawHours - deductionMinutes / 60);
          return formatShiftRange(new Date(sh.startTime), new Date(sh.endTime));
        })
        .join(" / ");

      const cellX = left + nameW + i * dayW + 2;
      const cellW = dayW - 4;

      doc.font("Helvetica-Bold").fillColor(COLORS.text);
      const fitted = fitText(doc, text, cellW, Math.max(6.1, 8.6 * scale), 5.1);

      drawCellText(doc, text, cellX, y, cellW, "Helvetica-Bold", fitted, "center");
    });

    drawCellText(
      doc,
      fmtHours(weeklyTotal),
      left + nameW + 7 * dayW,
      y,
      totalW,
      "Helvetica-Bold",
      Math.max(7.2, 9.6 * scale),
      "center"
    );
    weekGrandTotal += weeklyTotal;
  });

  // Footer row: week total
  const footerY = top + headerH * 2 + employees.length * rowH + 4.5;
  drawCellText(
    doc,
    "Total semaine",
    left + 4,
    footerY,
    nameW + 7 * dayW - 8,
    "Helvetica-Bold",
    Math.max(7.2, 9.4 * scale),
    "right"
  );
  drawCellText(
    doc,
    fmtHours(weekGrandTotal),
    left + nameW + 7 * dayW,
    footerY,
    totalW,
    "Helvetica-Bold",
    Math.max(7.4, 9.8 * scale),
    "center"
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const week = String(url.searchParams.get("week") ?? "").trim();
  const orderParam = String(url.searchParams.get("order") ?? "").trim();
  const requestedOrder = orderParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const sectionParam = String(url.searchParams.get("section") ?? "CAISSE_LAB").toUpperCase();
  const section: "CAISSE_LAB" | "FLOOR" =
    sectionParam.includes("FLOOR") ? "FLOOR" : "CAISSE_LAB";
  const departments: Department[] = section === "FLOOR" ? [Department.FLOOR] : [Department.CASH, Department.LAB];

  const base = week ? new Date(`${week}T12:00:00`) : new Date();
  const week1 = startOfWeek(base);
  const week2 = addDays(week1, 7);
  const end = addDays(week1, 14);

  const company = await getDefaultCompany();
  const companyId = company.id;

  const employeesRaw = await prisma.employee.findMany({
    where: { companyId, isActive: true, department: { in: departments } },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, paidBreak30: true },
  });
  const byId = new Map(employeesRaw.map((e) => [e.id, e]));
  const requested = requestedOrder.map((id) => byId.get(id)).filter((e): e is EmployeeLite => Boolean(e));
  const remaining = employeesRaw.filter((e) => !requestedOrder.includes(e.id));
  const employees = requested.length > 0 ? [...requested, ...remaining] : employeesRaw;

  const shifts = await prisma.shift.findMany({
    where: {
      status: ShiftStatus.PLANNED,
      employee: { is: { companyId, department: { in: departments } } },
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
    margin: 36,
    layout: "portrait",
    compress: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfDone = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const employeesPerPage = 16;

  for (let i = 0; i < employees.length; i += employeesPerPage) {
    const batch = employees.slice(i, i + employeesPerPage);

    if (i > 0) {
      doc.addPage({
        size: "A4",
        margin: 36,
        layout: "portrait",
      });
    }

    drawWeekTable(doc, {
      weekStart: week1,
      employees: batch,
      byUserDay: byUserDay1,
      topY: 56,
      showTitle: i === 0,
    });

    drawWeekTable(doc, {
      weekStart: week2,
      employees: batch,
      byUserDay: byUserDay2,
      topY: 422,
      showTitle: false,
    });
  }

  doc.end();

  const pdf = await pdfDone;
  const fileName = `horaire-${ymdInTZ(week1)}-to-${ymdInTZ(addDays(week2, 6))}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}