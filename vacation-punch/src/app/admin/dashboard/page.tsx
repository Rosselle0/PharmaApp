import { redirect } from "next/navigation";
import "./admin-dashboard.css";
import AdminDashboardClient from "./AdminDashboardClient";
import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const kiosk = await requireKioskManagerOrAdmin();
  if (!kiosk.ok) redirect("/kiosk");

  // ensure it's only ADMIN/MANAGER
  const role = kiosk.role === "ADMIN" ? "ADMIN" : "MANAGER";

  return <AdminDashboardClient role={role} />;
}
