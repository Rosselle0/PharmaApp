import "./creation-t.css";
import CreationTClient from "./ui";
import { requirePrivilegedOrRedirect } from "@/lib/privilgedAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePrivilegedOrRedirect();
  return <CreationTClient />;
}
