import "./admin-dashboard.css";
import AdminDashboardClient from "./AdminDashboardClient";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  const auth = await requirePrivilegedOrRedirect();
  return <AdminDashboardClient role={auth.role} />;
}
