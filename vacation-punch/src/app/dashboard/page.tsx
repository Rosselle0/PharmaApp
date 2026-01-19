// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Dashboard() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  return (
    <main style={{ padding: 40 }}>
      <h1>Dashboard</h1>
      <p>Logged in as: {data.user.email}</p>
    </main>
  );
}
