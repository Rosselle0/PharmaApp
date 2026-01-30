import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import KioskClient from "./KioskClient";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  let isAdminLogged = false;

  if (data?.user) {
    const me = await prisma.user.findUnique({
      where: { authUserId: data.user.id },
      select: { role: true },
    });

    isAdminLogged = me?.role === Role.ADMIN || me?.role === Role.MANAGER;
  }

  return <KioskClient isAdminLogged={isAdminLogged} />;
}
