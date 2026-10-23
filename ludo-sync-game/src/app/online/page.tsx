import { Suspense } from "react";
import OnlineClient from "@/components/online/OnlineClient";

export const metadata = { title: "Play online · Ludo Sync" };

export default function OnlinePage() {
  return (
    <Suspense fallback={null}>
      <OnlineClient />
    </Suspense>
  );
}
