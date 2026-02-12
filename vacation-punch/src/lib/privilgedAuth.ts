import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { Role as PrismaRole } from "@prisma/client";
import { cookies } from "next/headers";

export type PrivRole = "ADMIN" | "MANAGER";

// DEV ONLY: force anyone who logs in via Supabase to be privileged.
const FORCE_SUPABASE_ROLE: PrivRole =
  (process.env.SUPABASE_AUTO_ROLE as PrivRole) ?? "MANAGER";

async function getOrCreateDefaultCompanyId() {
  const companyName = process.env.DEFAULT_COMPANY_NAME ?? "RxPlanning";
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  return company.id;
}

async function getPrivFromKioskSession(defaultCompanyId: string): Promise<{
  ok: true;
  role: PrivRole;
  userId: string;      // NOTE: for kiosk we return employeeId here
  companyId: string;
  name: string | null;
} | null> {
  const store = await cookies();
  const sessionId = store.get("kiosk_session")?.value;
  if (!sessionId) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      employee: {
        select: { id: true, role: true, firstName: true, lastName: true, companyId: true, isActive: true },
      },
    },
  });

  if (!session) return null;
  if (Date.now() >= session.expiresAt.getTime()) return null;
  if (!session.employee.isActive) return null;

  const r = session.employee.role;
  if (r !== PrismaRole.ADMIN && r !== PrismaRole.MANAGER) return null;

  const fullName = `${session.employee.firstName ?? ""} ${session.employee.lastName ?? ""}`.trim() || null;

  return {
    ok: true,
    role: r as PrivRole,
    userId: session.employee.id,
    companyId: session.employee.companyId ?? defaultCompanyId,
    name: fullName,
  };
}

export async function requirePrivilegedOrRedirect(): Promise<{
  ok: true;
  role: PrivRole;
  userId: string;
  companyId: string;
  name: string | null;
}> {
  const defaultCompanyId = await getOrCreateDefaultCompanyId();

  // 1) Try Supabase (web/admin)
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (!error && data?.user) {
    const authUser = data.user;
    const email = authUser.email;
    if (!email) redirect("/kiosk?reason=no_email");

    const name =
      (authUser.user_metadata as any)?.name ??
      (authUser.user_metadata as any)?.full_name ??
      null;

    let me = await prisma.user.findUnique({
      where: { authUserId: authUser.id },
      select: { id: true, role: true, companyId: true, name: true, email: true },
    });

    if (!me) {
      const byEmail = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (byEmail) {
        me = await prisma.user.update({
          where: { id: byEmail.id },
          data: { authUserId: authUser.id },
          select: { id: true, role: true, companyId: true, name: true, email: true },
        });
      }
    }

    if (!me) {
      me = await prisma.user.create({
        data: {
          authUserId: authUser.id,
          email,
          name,
          role: FORCE_SUPABASE_ROLE,
          department: "FLOOR",
          companyId: defaultCompanyId,
        },
        select: { id: true, role: true, companyId: true, name: true, email: true },
      });
    } else {
      me = await prisma.user.update({
        where: { id: me.id },
        data: {
          role: FORCE_SUPABASE_ROLE,
          companyId: me.companyId ?? defaultCompanyId,
          name: me.name ?? name,
        },
        select: { id: true, role: true, companyId: true, name: true, email: true },
      });
    }

    if (me.role !== PrismaRole.ADMIN && me.role !== PrismaRole.MANAGER) {
      redirect("/kiosk?reason=role_denied");
    }

    return {
      ok: true,
      role: me.role as PrivRole,
      userId: me.id,
      companyId: me.companyId,
      name: me.name ?? null,
    };
  }

  // 2) Fallback: kiosk session (manager/admin from Employee table)
  const kiosk = await getPrivFromKioskSession(defaultCompanyId);
  if (kiosk) return kiosk;

  // 3) Neither auth method worked
  redirect("/kiosk?reason=no_auth");
}
