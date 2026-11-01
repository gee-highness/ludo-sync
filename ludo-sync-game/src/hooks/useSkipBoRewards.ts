"use client";

import { useToast } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { dateKey } from "@/lib/client/daily";
import { awardGame, type Award } from "@/lib/client/profile";
import { unlockedAt } from "@/lib/client/unlocks";
import { newlyUnlocked } from "@/lib/skipbo/achievements";
import { recordDaily } from "@/lib/skipbo/daily";
import { loadStats, recordTotals } from "@/lib/skipbo/stats";
import type { GameEvent } from "@/lib/skipbo/types";
import type { TableView } from "@/lib/skipbo/view";

export interface RecordOptions {
  /** Today's challenge. */
  daily?: boolean;
  /** Played with other people, online or nearby. */
  withFriends?: boolean;
}

const RANK = { easy: 1, normal: 2, hard: 3 } as const;

/**
 * Watches a game for the player's own moves and, when it ends, records the stats, hands out the experience and says what was
 * unlocked. Pass nothing to record nothing (pass and play, or watching).
 */
export function useSkipBoRewards(view: TableView, frame: { id: number; events: GameEvent[] }, record?: RecordOptions) {
  const toast = useToast();
  const [award, setAward] = useState<Award | null>(null);
  const t = useRef({ turnPlays: 0, bestTurn: 0, piles: 0, bonusHands: 0, wilds: 0, mine: false, recorded: false });

  useEffect(() => {
    if (frame.id === 0 || view.you === null) return;
    const c = t.current;
    for (const e of frame.events) {
      if (e.type === "deal" && e.round === 1) Object.assign(c, { turnPlays: 0, bestTurn: 0, piles: 0, bonusHands: 0, wilds: 0, mine: false, recorded: false });
      else if (e.type === "play") {
        c.mine = e.player === view.you;
        if (c.mine) { c.turnPlays += 1; if (e.card === 0) c.wilds += 1; }
      } else if (e.type === "pileDone") { if (c.mine) c.piles += 1; }
      else if (e.type === "draw" && e.bonus && e.player === view.you) c.bonusHands += 1;
      else if ((e.type === "discard" || e.type === "pass") && e.player === view.you) { c.bestTurn = Math.max(c.bestTurn, c.turnPlays); c.turnPlays = 0; }
    }
    // only when a new frame arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id]);

  useEffect(() => {
    const c = t.current;
    if (view.phase === "play") { if (c.recorded) { c.recorded = false; setAward(null); } return; }
    if (view.phase !== "over" || c.recorded || !record || view.you === null) return;
    c.recorded = true;
    const won = view.winner === view.you;
    const bots = view.players.filter(p => p.kind === "bot" && p.level);
    const botLevel = bots.length ? bots.reduce((a, b) => (RANK[b.level!] > RANK[a.level!] ? b : a)).level : undefined;
    const before = loadStats();
    const after = recordTotals({
      won, tournament: view.rules.tournament, botLevel, daily: record.daily, withFriends: record.withFriends,
      piles: c.piles, bestTurn: Math.max(c.bestTurn, c.turnPlays), bonusHands: c.bonusHands, wildsPlayed: c.wilds,
    });
    const a = awardGame({ game: "skipbo", won, players: view.players.length, botLevel, tournament: view.rules.tournament, daily: record.daily, withFriends: record.withFriends, points: view.players[view.you].points });
    setAward(a);
    if (record.daily) {
      const day = recordDaily(dateKey(), won);
      toast({ title: won ? "📅 Daily challenge won" : "📅 Daily challenge finished", description: won ? `${day.streakDays} day${day.streakDays === 1 ? "" : "s"} in a row` : "Come back tomorrow for a new one", status: won ? "success" : "info", duration: 6000, isClosable: true, position: "top" });
    }
    for (const x of newlyUnlocked(before, after)) toast({ title: `${x.icon} ${x.title}`, description: x.blurb, status: "success", duration: 6000, isClosable: true, position: "top" });
    if (a.leveledUp) {
      const gifts = unlockedAt(a.after.level);
      toast({ title: `⭐ Level ${a.after.level}`, description: gifts.length ? `Unlocked: ${gifts.map(g => g.name).join(", ")}` : "Keep playing to unlock more", status: "success", duration: 8000, isClosable: true, position: "top" });
    }
  }, [view, record, toast]);

  return award;
}
