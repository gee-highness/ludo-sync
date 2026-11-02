import GameMenu from "@/components/platform/GameMenu";
import { PLATFORM_GAMES, metaOf } from "@/lib/platform/registry";

export const dynamicParams = false;
export const generateStaticParams = () => PLATFORM_GAMES.map(g => ({ game: g.id }));
export const generateMetadata = async ({ params }: { params: Promise<{ game: string }> }) => ({ title: `${metaOf((await params).game)?.name ?? "Game"} · Ludo Sync` });

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  return <GameMenu gameId={(await params).game} />;
}
