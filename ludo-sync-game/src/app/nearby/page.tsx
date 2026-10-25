import { Suspense } from "react";
import NearbyClient from "@/components/nearby/NearbyClient";

export const metadata = { title: "Play nearby · Ludo Sync" };

export default function NearbyPage() {
  return (
    <Suspense fallback={null}>
      <NearbyClient />
    </Suspense>
  );
}
