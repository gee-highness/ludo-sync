"use client";

import { Badge } from "@chakra-ui/react";
import { useMemo } from "react";
import type { Seat } from "@/lib/ludo/board";
import type { Action, GameState } from "@/lib/ludo/types";
import type { FrameBus } from "@/lib/client/frames";
import { formatRoomCode } from "@/lib/net/crypto";
import type { Reaction } from "@/lib/net/host";
import type { RoomView } from "@/lib/net/protocol";
import GameScreen from "../game/GameScreen";
import { ReactionPanel } from "./Reactions";
import { useReactions } from "./hooks";

interface Props {
  room: RoomView;
  state: GameState;
  bus: FrameBus;
  act: (a: Action) => boolean;
  isHost: boolean;
  onReaction: (cb: (r: Reaction) => void) => () => void;
  sendReaction: (emoji: string) => void;
  onExit: () => void;
  onRematch?: () => void;
  /** Shown when the link to the host is down. */
  note?: string;
}

/** The ordinary game screen, dressed for a room: who is away, quick reactions, rematch from the host. */
export default function OnlineGame({ room, state, bus, act, isHost, onReaction, sendReaction, onExit, onRematch, note }: Props) {
  const items = useReactions(onReaction);
  const mySeats: Seat[] = room.you.seat === null ? [] : [room.you.seat];
  const away = useMemo(() => new Set(room.slots.flatMap(s => (s.kind === "human" && !s.connected ? [s.seat] : []))), [room.slots]);
  const tags = useMemo(() => Object.fromEntries(room.slots.flatMap(s => (s.kind === "human" && s.host ? [[s.seat, "Host"]] : []))), [room.slots]);
  return (
    <GameScreen
      state={state} bus={bus} mySeats={mySeats} act={act} runBots={isHost} onExit={onExit}
      exitWarning={isHost ? "Leaving closes the room for everyone." : room.you.seat === null ? "You will stop watching this game." : "Leaving forfeits your seat in the running game."}
      onRematch={onRematch} rematchLabel="Rematch" waitingText="Waiting for the host to start a rematch…"
      title={`Room ${formatRoomCode(room.code)}${mySeats.length === 0 ? " · watching" : ""}`}
      tags={tags} away={away}
      headerExtra={note ? <Badge colorScheme="orange">{note}</Badge> : undefined}
      panelExtra={<ReactionPanel items={items} onSend={sendReaction} />}
    />
  );
}
