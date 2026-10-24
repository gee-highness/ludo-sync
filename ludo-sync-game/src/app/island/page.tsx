import type { Metadata } from "next";
import IslandEditor from "@/components/island/IslandEditor";

export const metadata: Metadata = { title: "Island maker · Ludo Sync" };

export default function Page() {
  return <IslandEditor />;
}
