"use client";

import { Button, Center, Heading, Spinner, Text, VStack } from "@chakra-ui/react";
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

function LocalTable({ initial, you, hotseat, onExit }: { initial: GameState; you: number; hotseat: boolean; onExit: () => void }) {
  const { view, feed, act, rematch, covered, coverName, uncover } = useSkipBoLocal(initial, you, getSettings().speed, hotseat);
  return (
    <>
      <Table view={view} act={act} frame={feed.frame} log={feed.log} title={hotseat ? "Skip-Bo · pass and play" : "Skip-Bo"} onExit={onExit} onRematch={rematch} rematchLabel="Play again" />
      {covered && (
        <Center position="fixed" inset={0} zIndex={100} bg="#0c3a27" color="white" p={6} role="dialog" aria-modal="true" aria-label={`Pass the device to ${coverName}`}>
          <VStack spacing={4} textAlign="center" maxW="360px">
            <Text fontSize="5xl" aria-hidden>🃏</Text>
            <Heading size="lg">Pass to {coverName}</Heading>
            <Text color="whiteAlpha.800">Hand the device over. Nobody else should look at the screen. Your cards are hidden until you tap.</Text>
            <Button colorScheme="yellow" size="lg" w="100%" onClick={uncover}>I am {coverName}: show my cards</Button>
          </VStack>
        </Center>
      )}
    </>
  );
}

const oneOf = <T extends string>(v: string | null, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v ?? "") ? (v as T) : d);

export default function SkipBoPlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [started, setStarted] = useState<{ state: GameState; you: number; hotseat: boolean } | null>(null);

  useEffect(() => {
    if (params.get("resume") === "1") {
      const saved = loadGame();
      if (saved) { setStarted({ state: saved.state, you: saved.you, hotseat: saved.hotseat }); return; }
      router.replace("/skipbo");
      return;
    }
    const pass = params.get("mode") === "pass";
    const names = (params.get("names") ?? "").split(",").map(n => n.trim()).filter(Boolean).slice(0, 6);
    const bots = Math.max(1, Math.min(5, Math.floor(Number(params.get("bots") ?? 1)) || 1));
    const level = oneOf<BotLevel>(params.get("level"), ["easy", "normal", "hard"], "normal");
    const tournament = params.get("game") === "tournament" || params.get("mode") === "tournament";
    const stockParam = params.get("stock");
    const players = pass ? Math.max(2, names.length) : bots + 1;
    const stockSize = stockParam === "10" ? 10 : stockParam === "20" ? 20 : officialStock(players);
    const you = 0;
    const setups: PlayerSetup[] = pass
      ? Array.from({ length: players }, (_, i) => ({ name: cleanName(names[i] ?? "", `Player ${i + 1}`), kind: "human" as const }))
      : [
        { name: cleanName(params.get("name") ?? getSettings().playerName, "Player"), kind: "human" },
        ...Array.from({ length: bots }, (_, i) => ({ name: ["Mia", "Leo", "Ava", "Max", "Zoe"][i], kind: "bot" as const, level })),
      ];
    const state = createGame(setups, { stockSize, tournament }, freshSeed());
    // the dealer is random, so the human may not go first: that is part of the game
    clearSavedGame();
    saveGame(state, you, pass);
    router.replace("/skipbo/play?resume=1");
    setStarted({ state, you, hotseat: pass });
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!started) return <Center minH="100dvh" bg="#14573a"><Spinner color="white" size="xl" /></Center>;
  return <LocalTable initial={started.state} you={started.you} hotseat={started.hotseat} onExit={() => router.push("/skipbo")} />;
}
