import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

 if (data?.user) {
    redirect("/kiosk");
  }

  // Everyone else → kiosk main screen
  redirect("/kiosk");
}
