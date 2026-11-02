import { Suspense } from "react";
import PlayClient from "@/components/platform/PlayClient";
import { PLATFORM_GAMES } from "@/lib/platform/registry";

export const dynamicParams = false;
export const generateStaticParams = () => PLATFORM_GAMES.map(g => ({ game: g.id }));

export default async function PlayPage({ params }: { params: Promise<{ game: string }> }) {
  return <Suspense fallback={null}><PlayClient gameId={(await params).game} /></Suspense>;
}
