import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import KioskClient from "./KioskClient";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskPage() {
  noStore();

  const auth = await requireKioskManagerOrAdmin();

  const isAdminLogged = auth.ok && auth.role === "ADMIN";
  const isManagerLogged = auth.ok && auth.role === "MANAGER";

  let privilegedName: string | undefined;
  let privilegedCode: string | undefined;

  if (auth.ok && auth.via === "supabase") {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      const me = await prisma.user.findUnique({
        where: { authUserId: data.user.id },
        select: {
          role: true,
          name: true,
          email: true,
        },
      });

      if (me?.role === Role.ADMIN || me?.role === Role.MANAGER) {
        privilegedName = me.name ?? me.email?.split("@")[0] ?? "Utilisateur";
      }
    }
  }

  if (auth.ok && auth.via === "kiosk") {
    const employee = await prisma.employee.findUnique({
      where: { id: auth.employeeId },
      select: {
        firstName: true,
        lastName: true,
        employeeCode: true,
        role: true,
      },
    });

    if (employee?.role === Role.ADMIN || employee?.role === Role.MANAGER) {
      privilegedName = employee.firstName ?? employee.employeeCode ?? "Utilisateur";
      privilegedCode = employee.employeeCode ?? undefined;
    }
  }

  return (
    <KioskClient
      isAdminLogged={isAdminLogged}
      isManagerLogged={isManagerLogged}
      privilegedName={privilegedName}
      privilegedCode={privilegedCode}
    />
  );
}