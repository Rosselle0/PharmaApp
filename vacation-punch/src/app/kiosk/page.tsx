import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import KioskClient from "./KioskClient";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskPage() {
  noStore();

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  let isAdminLogged = false;
  let isManagerLogged = false;
  let adminName: string | undefined;

  if (data?.user) {
    const me = await prisma.user.findUnique({
      where: { authUserId: data.user.id },
      select: { role: true, name: true, email: true },
    });

    isAdminLogged = me?.role === Role.ADMIN;
    isManagerLogged = me?.role === Role.MANAGER;

    if (isAdminLogged || isManagerLogged) {
      adminName = me?.name ?? (me?.email ? me.email.split("@")[0] : "Admin");
    }
  }

  return (
    <KioskClient
      isAdminLogged={isAdminLogged}
      isManagerLogged={isManagerLogged}
      adminName={adminName}
    />
  );
}
