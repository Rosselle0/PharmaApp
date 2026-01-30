import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import CreateEmployeeClient from "./ui";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/kiosk");

  const me = await prisma.user.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true },
  });

  if (!me || (me.role !== Role.ADMIN && me.role !== Role.MANAGER)) redirect("/kiosk");

  return <CreateEmployeeClient />;
}
