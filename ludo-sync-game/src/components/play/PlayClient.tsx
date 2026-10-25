"use client";

import { Center, Spinner } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createGame } from "@/lib/ludo/engine";
import { freshSeed } from "@/lib/ludo/rng";
import type { GameState, PlayerSetup, Rules } from "@/lib/ludo/types";
import type { Seat } from "@/lib/ludo/board";
import { clearSavedGame, loadGame } from "@/lib/client/save";
import { getSettings } from "@/lib/client/settings";
import { applyPalette, type PaletteMap } from "@/lib/client/palette";
import { dailyChallenge, dailySetups, dateKey } from "@/lib/client/daily";
import { useLocalGame } from "@/hooks/useLocalGame";
import GameScreen from "@/components/game/GameScreen";
import SetupScreen, { initialSlots, slotsToSetups, type Preset } from "@/components/setup/SetupScreen";

interface Started { state: GameState; humans: Seat[]; palette: PaletteMap; daily?: boolean }

const humansOf = (setups: PlayerSetup[]) => setups.filter(s => s.kind === "human").map(s => s.seat);

function LocalGame({ initial, onExit }: { initial: Started; onExit: () => void }) {
  const [daily, setDaily] = useState(!!initial.daily);
  const { state, bus, act, reset } = useLocalGame(initial.state, initial.humans, initial.palette);
  // the colours chosen for this game, applied for as long as it is on screen
  useEffect(() => { applyPalette(initial.palette); return () => applyPalette(getSettings().palette); }, [initial.palette]);
  const rematch = useCallback(() => {
    setDaily(false);
    reset(createGame(
      state.players.map(p => ({ seat: p.seat, name: p.name, kind: p.kind, level: p.level })),
      state.rules,
      freshSeed(),
    ));
  }, [reset, state]);

  return (
    <GameScreen
      state={state} bus={bus} mySeats={initial.humans} act={act} runBots recordStats onExit={onExit} onRematch={rematch} daily={daily}
      rematchLabel={daily ? "Play a normal game" : undefined}
      exitWarning="Your game is saved on this device. Pick Resume on the menu to carry on."
    />
  );
}

export default function PlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const preset: Preset = params.get("preset") === "local" ? "local" : "bot";
  const wantsResume = params.get("resume") === "1";
  const wantsQuick = params.get("quick") === "1";
  const wantsDaily = params.get("daily") === "1";
  const [started, setStarted] = useState<Started | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (wantsResume) {
      const saved = loadGame();
      if (saved) setStarted({ state: saved.state, humans: saved.humanSeats, palette: saved.palette });
      else router.replace("/play?preset=bot");
    } else if (wantsDaily) {
      const s = getSettings();
      const day = dailyChallenge(dateKey());
      const setups = dailySetups(day, s.playerName.trim() || "Player 1");
      clearSavedGame();
      setStarted({ state: createGame(setups, day.rules, day.seed), humans: [0], palette: s.palette, daily: true });
    } else if (wantsQuick) {
      const s = getSettings();
      const setups = slotsToSetups(initialSlots(preset, s.playerName, s.botLevel));
      clearSavedGame();
      setStarted({ state: createGame(setups, s.rules, freshSeed()), humans: humansOf(setups), palette: s.palette });
    }
    setReady(true);
  }, [wantsResume, wantsQuick, wantsDaily, preset, router]);

  const onStart = useCallback((setups: PlayerSetup[], rules: Rules) => {
    clearSavedGame();
    setStarted({ state: createGame(setups, rules, freshSeed()), humans: humansOf(setups), palette: getSettings().palette });
  }, []);

  const exit = useCallback(() => router.push("/"), [router]);
  const key = useMemo(() => started?.state.seq === 0 ? `${started.state.rng}` : "game", [started]);

  if (!ready) return <Center h="100dvh" bg="#303030"><Spinner color="white" size="xl" /></Center>;
  if (started) return <LocalGame key={key} initial={started} onExit={exit} />;
  return <SetupScreen preset={preset} onStart={onStart} onBack={exit} />;
}
