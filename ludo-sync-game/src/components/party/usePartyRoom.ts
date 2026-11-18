"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Network } from "@/lib/net/transport";
import type { PartyLeader } from "@/lib/party/session";
import { onlinePathFor, partyStore, type KeptGame } from "@/lib/party/store";
import { extractRoomCode } from "@/lib/net/identity";

export type PartyRoomRole = { host: true; network: Network; code: string; keep: KeptGame } | { host: false; network: Network; keep: KeptGame };

/**
 * On a game's online screen opened by the party (`?party=1`): the leader hosts the party's room for this game on the party's own
 * connections, and members join it there. Read once, when the screen opens. Null when the screen was opened any other way.
 */
export const usePartyRoom = (game: string): PartyRoomRole | null => {
  const params = useSearchParams();
  const [role] = useState<PartyRoomRole | null>(() => {
    const p = partyStore.get().party;
    if (params?.get("party") !== "1" || !p || p.status === "closed") return null;
    const base = onlinePathFor(game);
    if (p.leader) {
      const code = partyStore.roomCodeFor(game);
      return { host: true, network: p.network, code, keep: { key: `host:${game}:${code}`, game, href: `${base}?party=1`, host: true } };
    }
    const code = extractRoomCode(params.get("join") ?? "");
    if (!code) return null;
    return { host: false, network: p.network, keep: { key: `guest:${game}:${code}`, game, href: `${base}?join=${code}&party=1`, host: false } };
  });
  return role;
};

/** The leader's room is open: tell the party, so members are brought in. Cleared when the room is ended for good. */
export const usePartyAnnounce = (game: string, role: PartyRoomRole | null, status: string | undefined, code: string | undefined) => {
  const open = !!role?.host && status === "ready" && !!code;
  useEffect(() => {
    if (!open || !code) return;
    const leader = partyStore.get().party as PartyLeader | null;
    if (!leader?.leader) return;
    // stays announced after this screen closes: the room keeps running in the background until it is ended
    leader.setRoom({ game, code });
  }, [open, game, code]);
};
