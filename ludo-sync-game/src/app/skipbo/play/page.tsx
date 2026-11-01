import { Suspense } from "react";
import SkipBoPlayClient from "@/components/skipbo/PlayClient";

export const metadata = { title: "Play Skip-Bo · Ludo Sync" };

export default function SkipBoPlayPage() {
  return (
    <Suspense fallback={null}>
      <SkipBoPlayClient />
    </Suspense>
  );
}
