"use client";

import { Center, Spinner } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cleanName } from "@/lib/ludo/engine";
import { freshSeed } from "@/lib/ludo/rng";
import { getSettings } from "@/lib/client/settings";
import { createGame, officialStock } from "@/lib/skipbo/engine";
import { clearSavedGame, loadGame, saveGame } from "@/lib/skipbo/save";
import type { BotLevel, GameState, PlayerSetup } from "@/lib/skipbo/types";
import { useSkipBoLocal } from "@/hooks/useSkipBoLocal";
import { Table } from "./Table";

function LocalTable({ initial, you, onExit }: { initial: GameState; you: number; onExit: () => void }) {
  const { view, feed, act, rematch } = useSkipBoLocal(initial, you, getSettings().speed);
  return (
    <Table view={view} act={act} frame={feed.frame} log={feed.log} title="Skip-Bo" onExit={onExit} onRematch={rematch} rematchLabel="Play again" />
  );
}

const oneOf = <T extends string>(v: string | null, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v ?? "") ? (v as T) : d);

export default function SkipBoPlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [started, setStarted] = useState<{ state: GameState; you: number } | null>(null);

  useEffect(() => {
    if (params.get("resume") === "1") {
      const saved = loadGame();
      if (saved) { setStarted({ state: saved.state, you: saved.you }); return; }
      router.replace("/skipbo");
      return;
    }
    const bots = Math.max(1, Math.min(5, Math.floor(Number(params.get("bots") ?? 1)) || 1));
    const level = oneOf<BotLevel>(params.get("level"), ["easy", "normal", "hard"], "normal");
    const tournament = params.get("mode") === "tournament";
    const stockParam = params.get("stock");
    const players = bots + 1;
    const stockSize = stockParam === "10" ? 10 : stockParam === "20" ? 20 : officialStock(players);
    const you = 0;
    const setups: PlayerSetup[] = [
      { name: cleanName(params.get("name") ?? getSettings().playerName, "Player"), kind: "human" },
      ...Array.from({ length: bots }, (_, i) => ({ name: ["Mia", "Leo", "Ava", "Max", "Zoe"][i], kind: "bot" as const, level })),
    ];
    const state = createGame(setups, { stockSize, tournament }, freshSeed());
    // the dealer is random, so the human may not go first: that is part of the game
    clearSavedGame();
    saveGame(state, you);
    router.replace("/skipbo/play?resume=1");
    setStarted({ state, you });
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!started) return <Center minH="100dvh" bg="#14573a"><Spinner color="white" size="xl" /></Center>;
  return <LocalTable initial={started.state} you={started.you} onExit={() => router.push("/skipbo")} />;
}
