import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedOrRedirect();
  return <>{children}</>;
}
