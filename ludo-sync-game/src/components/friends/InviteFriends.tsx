"use client";

import { Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InviteResult } from "@/lib/friends/service";
import { formatFriendCode } from "@/lib/friends/store";
import { useFriends } from "./FriendsProvider";

type Sent = InviteResult | "sending";
const WORDS: Record<InviteResult | "sending", string> = { sending: "Sending…", delivered: "Invited ✓", offline: "Not online: share the link", "not-friend": "Not friends any more" };

/** One tap to invite a friend to the room you just opened. It lands on their screen if their app is open. */
export function InviteFriends({ gameId, room }: { gameId: string; room: string }) {
  const { service, snap } = useFriends();
  const [online, setOnline] = useState<Record<string, boolean | undefined>>({});
  const [sent, setSent] = useState<Record<string, Sent>>({});
  const auto = useRef(false);
  const friends = (snap?.friends ?? []).filter(f => f.confirmed);

  const send = useCallback(async (code: string) => {
    if (!service) return;
    setSent(s => ({ ...s, [code]: "sending" }));
    const r = await service.invite(code, gameId, room);
    setSent(s => ({ ...s, [code]: r }));
  }, [service, gameId, room]);

  // who has the app open right now
  useEffect(() => {
    if (!service || !friends.length) return;
    let alive = true;
    void (async () => { for (const f of friends.slice(0, 12)) { const p = await service.ping(f.code); if (!alive) return; setOnline(o => ({ ...o, [f.code]: p.online })); } })();
    return () => { alive = false; };
    // check once when the list appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, friends.length]);

  // "Play with a friend" starts a room and invites them without another tap
  useEffect(() => {
    if (auto.current || !service || !friends.length) return;
    const codes = new URLSearchParams(window.location.search).get("invite")?.split(",").filter(Boolean) ?? [];
    if (!codes.length) return;
    auto.current = true;
    for (const c of codes) if (friends.some(f => f.code === c)) void send(c);
  }, [service, friends, send]);

  if (!service) return null;
  return (
    <VStack w="100%" align="stretch" spacing={2} pt={1} role="group" aria-label="Invite friends">
      <HStack justify="space-between">
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">Invite a friend</Text>
        <Button as={Link} href="/friends" size="xs" variant="link" color="sky.300">Friends</Button>
      </HStack>
      {friends.length === 0 && <Text fontSize="sm" color="gray.400">Add friends once, then invite them here with one tap: no links to send.</Text>}
      {friends.map(f => (
        <HStack key={f.code} bg="blackAlpha.300" borderRadius="lg" px={3} py={2} justify="space-between">
          <HStack minW={0} spacing={2}>
            <Box w="10px" h="10px" borderRadius="full" bg={online[f.code] ? "green.400" : online[f.code] === false ? "gray.500" : "yellow.500"} aria-label={online[f.code] ? "online" : online[f.code] === false ? "not online" : "checking"} />
            <Box minW={0}><Text fontWeight={700} noOfLines={1}>{f.name}</Text><Text fontSize="2xs" color="gray.500" fontFamily="mono">{formatFriendCode(f.code)}</Text></Box>
          </HStack>
          {sent[f.code] ? <Badge colorScheme={sent[f.code] === "delivered" ? "green" : sent[f.code] === "sending" ? "gray" : "orange"} whiteSpace="normal" textAlign="right">{WORDS[sent[f.code]]}</Badge>
            : <Button size="sm" colorScheme="yellow" onClick={() => void send(f.code)}>Invite</Button>}
        </HStack>
      ))}
    </VStack>
  );
}
