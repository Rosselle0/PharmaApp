import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import KioskClient from "./KioskClient";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  let isAdminLogged = false;
  let adminName: string | undefined;
  let isManagerLogged = false;

  if (data?.user) {
    const me = await prisma.user.findUnique({
      where: { authUserId: data.user.id },
      select: { role: true, name: true, email: true },
    });

    isAdminLogged = me?.role === Role.ADMIN || me?.role === Role.MANAGER;

    if (isAdminLogged) {
      adminName =
        me?.name ??
        (me?.email ? me.email.split("@")[0] : "Admin");
    }
  }

  return <KioskClient isAdminLogged={isAdminLogged} adminName={adminName} isManagerLogged={isManagerLogged}/>;
}
