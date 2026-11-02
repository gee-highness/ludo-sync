import { Suspense } from "react";
import OnlineClient from "@/components/platform/OnlineClient";
import { PLATFORM_GAMES } from "@/lib/platform/registry";

export const dynamicParams = false;
export const generateStaticParams = () => PLATFORM_GAMES.map(g => ({ game: g.id }));

export default async function OnlinePage({ params }: { params: Promise<{ game: string }> }) {
  return <Suspense fallback={null}><OnlineClient gameId={(await params).game} /></Suspense>;
}
