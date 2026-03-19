import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";
import AdminSidebar from "./AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePrivilegedOrRedirect();
  return (
    <div className="adminLayout">
      <AdminSidebar role={auth.role} />
      <main className="adminLayoutMain">{children}</main>
    </div>
  );
}
