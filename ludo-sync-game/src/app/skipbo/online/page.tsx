import { Suspense } from "react";
import SkipBoOnlineClient from "@/components/skipbo/OnlineClient";

export const metadata = { title: "Skip-Bo online · Ludo Sync" };

export default function SkipBoOnlinePage() {
  return (
    <Suspense fallback={null}>
      <SkipBoOnlineClient />
    </Suspense>
  );
}
