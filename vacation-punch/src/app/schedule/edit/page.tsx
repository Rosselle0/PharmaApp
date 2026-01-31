// src/app/schedule/edit/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import ScheduleEditorClient from "./ui";

function startOfWeekSunday(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
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

async function getDefaultCompany() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  return (
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }))
  );
}

export default async function ScheduleEditPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  noStore();

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true },
  });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const company = await getDefaultCompany();
  const companyId = company.id;

  const sp = await searchParams; // ✅ UNWRAP PROMISE
  const base = sp.week ? new Date(sp.week + "T12:00:00") : new Date();

  const weekStart = startOfWeekSunday(base);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, department: true },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PLANNED",
      employee: { is: { companyId } },
      AND: [{ startTime: { lt: weekEnd } }, { endTime: { gt: weekStart } }],
    },
    orderBy: [{ startTime: "asc" }],
    select: { id: true, employeeId: true, startTime: true, endTime: true, note: true },
  });

  const shiftsForClient = shifts.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    note: s.note ?? null,
  }));

  return (
    <ScheduleEditorClient
      weekStartYMD={ymdLocal(weekStart)}
      daysYMD={days.map(ymdLocal)}
      employees={employees}
      shifts={shiftsForClient}
    />
  );
}
