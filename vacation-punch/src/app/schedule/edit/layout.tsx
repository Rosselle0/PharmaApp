import { requireKioskManagerOrAdmin } from "@/lib/kioskAuth";
import AdminSidebar from "@/app/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function ScheduleEditLayout({ children }: { children: React.ReactNode }) {
  const res = await requireKioskManagerOrAdmin();
  if (!res.ok) return children;

  // Same visual sidebar as /admin/* pages, but allowed for kiosk managers/admins.
  return (
    <div className="adminLayout">
      {/* AdminSidebar is a client component; passing server role is fine */}
      <AdminSidebar role={res.role as any} />
      <main className="adminLayoutMain">{children}</main>
    </div>
  );
}

