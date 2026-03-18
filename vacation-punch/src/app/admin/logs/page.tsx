import "./admin-logs.css";
import AdminLogsClient from "./AdminLogsClient";
import { getPrivilegedContextOrRedirect } from "@/lib/adminContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  await getPrivilegedContextOrRedirect();
  return <AdminLogsClient />;
}

