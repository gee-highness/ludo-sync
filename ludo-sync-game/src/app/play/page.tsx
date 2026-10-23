import { Suspense } from "react";
import PlayClient from "@/components/play/PlayClient";

export const metadata = { title: "Play · Ludo Sync" };

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayClient />
    </Suspense>
  );
}
