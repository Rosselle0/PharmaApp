import { Suspense } from "react";
import LockClient from "./LockClient";

export const dynamic = "force-dynamic";

export default function PunchLockPage() {
  return (
    <Suspense fallback={null}>
      <LockClient />
    </Suspense>
  );
}
