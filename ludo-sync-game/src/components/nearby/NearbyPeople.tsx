"use client";

import { Avatar, Badge, Box, Button, Flex, HStack, Switch, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { sound } from "@/lib/client/audio";
import { nearbyPlayers, type NearbyPeer } from "@/lib/native/nearbyPlayers";
import { useFriends } from "@/components/friends/FriendsProvider";
import { setNearbyVisible, useNearby, useNearbyVisible } from "./NearbyPlayersProvider";


/** A soft radar while the phone looks around. */
const Radar = () => (
  <Box position="relative" w="44px" h="44px" flexShrink={0} aria-hidden>
    <style>{`@keyframes nbpulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(2.2);opacity:0}}@media (prefers-reduced-motion: reduce){.nbpulse{animation:none!important;opacity:.4}}`}</style>
    {[0, 1].map(i => <Box key={i} className="nbpulse" position="absolute" inset={0} borderRadius="full" border="2px solid" borderColor="cyan.300" animation={`nbpulse 2.2s ease-out ${i * 1.1}s infinite`} />)}
    <Flex position="absolute" inset="10px" borderRadius="full" bg="cyan.400" align="center" justify="center" fontSize="sm">📡</Flex>
  </Box>
);

type InviteState = "sending" | "joined" | "declined" | "failed";
const STATE_LABEL: Record<InviteState, string> = { sending: "Waiting…", joined: "Joined ✓", declined: "Said not now", failed: "Couldn't reach" };

/**
 * People nearby with the app open (Android app): friends first, then everyone else, each one tap to invite.
 * `exclude` hides people already in. On the web this shows a one-line hint, since browsers cannot look for nearby phones.
 */
export function NearbyPeople({ onInvite, exclude = [], title = "People nearby", what = "Invite" }: {
  onInvite: (peer: NearbyPeer) => Promise<void>;
  exclude?: string[];
  title?: string;
  what?: string;
}) {
  const st = useNearby();
  const visible = useNearbyVisible();
  const { snap } = useFriends();
  const [sent, setSent] = useState<Record<string, InviteState>>({});

  if (!st.supported) {
    return <Text fontSize="xs" color="gray.400">📱 In the Android app, friends nearby show up here by themselves: no codes to swap.</Text>;
  }

  const friendCodes = new Set(snap?.friends.filter(f => f.confirmed).map(f => f.code) ?? []);
  const peers = st.peers.filter(p => !exclude.includes(p.device));
  const friends = peers.filter(p => friendCodes.has(p.code));
  const others = peers.filter(p => !friendCodes.has(p.code));

  const invite = async (p: NearbyPeer) => {
    sound.unlock(); sound.play("click");
    setSent(s => ({ ...s, [p.device]: "sending" }));
    try { await onInvite(p); setSent(s => ({ ...s, [p.device]: "joined" })); sound.play("turn"); }
    catch (e) { setSent(s => ({ ...s, [p.device]: /declined/.test(String((e as Error)?.message)) ? "declined" : "failed" })); }
  };

  const Row = ({ p, friend }: { p: NearbyPeer; friend: boolean }) => {
    const state = sent[p.device];
    return (
      <HStack p={2} pl={3} borderRadius="xl" bg={friend ? "rgba(234,179,8,.12)" : "whiteAlpha.100"} border="1px solid" borderColor={friend ? "yellow.600" : "transparent"}>
        <Avatar size="sm" name={p.name} bg={friend ? "yellow.500" : "cyan.700"} color={friend ? "black" : "white"} />
        <Box flex={1} minW={0}>
          <HStack spacing={2}><Text fontWeight={800} noOfLines={1}>{p.name}</Text>{friend && <Badge colorScheme="yellow">Friend</Badge>}</HStack>
          <Text fontSize="xs" color="gray.400">{p.routes.lan ? "Same Wi-Fi" : "Bluetooth"}</Text>
        </Box>
        <Button size="sm" minW="96px" colorScheme={state === "joined" ? "green" : "cyan"} isLoading={state === "sending"} loadingText="Waiting…"
          isDisabled={state === "joined" || state === "sending"} onClick={() => void invite(p)}>
          {state && state !== "sending" ? (state === "declined" || state === "failed" ? "Try again" : STATE_LABEL[state]) : what}
        </Button>
      </HStack>
    );
  };

  return (
    <VStack align="stretch" spacing={3} w="100%">
      <HStack>
        <Text fontWeight={900} flex={1}>{title}</Text>
        <Text as="label" htmlFor="nearby-visible" fontSize="xs" color="gray.300">Visible</Text>
        <Switch id="nearby-visible" colorScheme="cyan" isChecked={visible} onChange={e => { sound.play("click"); setNearbyVisible(e.target.checked); }} />
      </HStack>

      {!visible && <Text fontSize="sm" color="gray.300">You&apos;re hidden. Turn on <b>Visible</b> to find people nearby and let them find you.</Text>}

      {visible && !st.granted && st.google && (
        <HStack p={3} borderRadius="xl" bg="rgba(34,211,238,.1)" border="1px solid" borderColor="cyan.700" align="start">
          <Text fontSize="sm" flex={1}>Allow <b>Nearby devices</b> to find people over Bluetooth, even with no Wi-Fi or hotspot.</Text>
          <Button size="sm" colorScheme="cyan" onClick={() => { sound.play("click"); void nearbyPlayers().allow(); }}>Allow</Button>
        </HStack>
      )}

      {visible && friends.map(p => <Row key={p.device} p={p} friend />)}
      {visible && friends.length > 0 && others.length > 0 && <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing=".12em" fontWeight={800} pt={1}>Others nearby</Text>}
      {visible && others.map(p => <Row key={p.device} p={p} friend={false} />)}

      {visible && !peers.length && (
        <HStack spacing={4} p={3} borderRadius="xl" bg="whiteAlpha.50">
          <Radar />
          <Box>
            <Text fontWeight={700}>Looking for phones nearby…</Text>
            <Text fontSize="xs" color="gray.400">Ask friends to open the app. They appear here by themselves{st.granted ? "" : " when you're on the same Wi-Fi or hotspot"}.</Text>
          </Box>
        </HStack>
      )}
      {Object.values(sent).some(s => s === "failed") && <Text fontSize="xs" color="gray.400">If someone can&apos;t be reached, move closer or join the same Wi-Fi or hotspot.</Text>}
    </VStack>
  );
}
