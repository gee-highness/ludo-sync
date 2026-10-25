"use client";

import { Badge, Box } from "@chakra-ui/react";
import { useMemo } from "react";
import type { Seat } from "@/lib/ludo/board";
import type { Action, GameState } from "@/lib/ludo/types";
import type { FrameBus } from "@/lib/client/frames";
import { formatRoomCode } from "@/lib/net/crypto";
import type { Reaction } from "@/lib/net/host";
import type { RoomView } from "@/lib/net/protocol";
import GameScreen from "../game/GameScreen";
import { ChatPanel, type ChatSource } from "./ChatPanel";
import { useReactionLog } from "./hooks";

interface Props {
  room: RoomView;
  state: GameState;
  bus: FrameBus;
  act: (a: Action) => boolean;
  isHost: boolean;
  onReaction: (cb: (r: Reaction) => void) => () => void;
  sendReaction: (emoji: string) => void;
  chat: ChatSource;
  onExit: () => void;
  /** Quit for good: a guest gives up the seat, the host closes the room for everyone. */
  onForfeit: () => void;
  onRematch?: () => void;
  /** Shown when the link to the host is down. */
  note?: string;
  /** Replaces the room name in the header (nearby games have no room code). */
  title?: string;
  /** An extra button in the header, such as "invite a player". */
  headerAction?: React.ReactNode;
}

/** The ordinary game screen, dressed for a room: who is away, quick reactions, rematch from the host. */
export default function OnlineGame({ room, state, bus, act, isHost, onReaction, sendReaction, chat, onExit, onForfeit, onRematch, note, title, headerAction }: Props) {
  const reactions = useReactionLog(onReaction);
  const mySeats: Seat[] = room.you.seat === null ? [] : [room.you.seat];
  const away = useMemo(() => new Set(room.slots.flatMap(s => (s.kind === "human" && !s.connected ? [s.seat] : []))), [room.slots]);
  const tags = useMemo(() => Object.fromEntries(room.slots.flatMap(s => (s.kind === "human" && s.host ? [[s.seat, "Host"]] : []))), [room.slots]);
  return (
    <GameScreen
      state={state} bus={bus} mySeats={mySeats} act={act} runBots={isHost} onExit={onExit}
      exitWarning={isHost
        ? "The game pauses while you are away and guests wait for you. Open the menu and choose Rejoin to carry on."
        : room.you.seat === null ? "You will stop watching this game. You can rejoin from the menu."
        : "Your seat is kept and the game plays your turns while you are away. Open the menu and choose Rejoin to come back."}
      onForfeit={room.you.seat === null && !isHost ? undefined : onForfeit}
      forfeitWarning={isHost ? "Closing the room ends the game for everyone and cannot be undone." : "Quitting for good gives up your seat and cannot be undone."}
      guardUnload
      onRematch={onRematch} rematchLabel="Rematch" waitingText="Waiting for the host to start a rematch…"
      title={`${title ?? `Room ${formatRoomCode(room.code)}`}${mySeats.length === 0 ? " · watching" : ""}`}
      tags={tags} away={away} reactions={reactions}
      headerExtra={note || headerAction ? <>{note && <Badge colorScheme="orange">{note}</Badge>}{headerAction}</> : undefined}
      panelExtra={
        <Box bg="whiteAlpha.100" borderRadius="xl" p={2} flexShrink={0}>
          <ChatPanel items={chat.items} onSend={chat.onSend} mySeat={room.you.seat} reactions={reactions} onReact={sendReaction} height="clamp(230px, 34dvh, 340px)" />
        </Box>
      }
    />
  );
}
