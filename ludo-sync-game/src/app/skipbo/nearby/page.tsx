import { Suspense } from "react";
import SkipBoNearbyClient from "@/components/skipbo/NearbyClient";

export const metadata = { title: "Skip-Bo nearby · Ludo Sync" };

export default function SkipBoNearbyPage() {
  return (
    <Suspense fallback={null}>
      <SkipBoNearbyClient />
    </Suspense>
  );
}
