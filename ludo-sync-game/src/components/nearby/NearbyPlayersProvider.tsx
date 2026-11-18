"use client";

import { Avatar, Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { sound } from "@/lib/client/audio";
import { readJSON, writeJSON } from "@/lib/client/storage";
import { getSettings } from "@/lib/client/settings";
import { deviceStore, loadMyCode } from "@/lib/friends/store";
import { handOff } from "@/lib/native/handoff";
import { nearbyPlayers, type IncomingInvite } from "@/lib/native/nearbyPlayers";
import { getClientId } from "@/lib/net/identity";
import { partyStore } from "@/lib/party/store";
import { useFriends } from "@/components/friends/FriendsProvider";

const VISIBLE_KEY = "nearby-visible";
let visibleSetting: boolean | null = null;
const listeners = new Set<() => void>();
/** Whether this phone lets people nearby find it while the app is open. On unless switched off. */
export const getNearbyVisible = () => (visibleSetting ??= readJSON<boolean>(VISIBLE_KEY, true));
export const setNearbyVisible = (on: boolean) => { visibleSetting = on; writeJSON(VISIBLE_KEY, on); listeners.forEach(l => l()); };
const subscribeVisible = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export const useNearby = () => {
  const np = nearbyPlayers();
  return useSyncExternalStore(np.subscribe, np.get, np.get);
};
export const useNearbyVisible = () => useSyncExternalStore(subscribeVisible, getNearbyVisible, () => true);

const me = () => ({ device: getClientId(), name: getSettings().playerName.trim() || "Player", code: loadMyCode(deviceStore) });

const what = (inv: IncomingInvite) => (inv.kind.k === "party" ? "their party" : inv.kind.k === "ludo" ? "a game of Ludo" : "a game of Skip-Bo");

/** Keeps this phone findable by people nearby while the app is open (Android app only), and shows their invites anywhere. */
export function NearbyPlayersProvider() {
  const router = useRouter();
  const state = useNearby();
  const visible = useNearbyVisible();
  const { snap: friends } = useFriends();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // visible only while the app is in front, and only if the player wants to be
  useEffect(() => {
    const np = nearbyPlayers();
    if (!np.get().supported) return;
    const sync = () => { if (visible && !document.hidden) void np.start(me()); else void np.stop(); };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [visible]);

  useEffect(() => { if (state.invites.length) sound.play("turn"); }, [state.invites.length]);

  const isFriend = (code: string) => !!friends?.friends.some(f => f.confirmed && f.code === code);

  const join = async (inv: IncomingInvite) => {
    sound.unlock(); sound.play("click");
    setBusy(inv.cid); setError("");
    try {
      const link = await nearbyPlayers().accept(inv);
      if (inv.kind.k === "party") {
        partyStore.joinWithLink({ id: getClientId(), name: me().name }, link, inv.kind.p);
        router.push("/party");
      } else {
        handOff(inv.kind.k, link);
        router.push(inv.kind.k === "ludo" ? "/nearby?invited=1" : "/skipbo/nearby?invited=1");
      }
    } catch { setError("Could not connect. Ask them to invite you again."); }
    setBusy(null);
  };

  if (!state.invites.length && !error) return null;
  const inParty = !!partyStore.get().party;
  return (
    <VStack position="fixed" top="max(8px, env(safe-area-inset-top))" left={2} right={2} zIndex={2100} spacing={2} pointerEvents="none" role="region" aria-label="Invites from people nearby">
      {state.invites.slice(-2).map(inv => (
        <Box key={inv.cid} pointerEvents="auto" w="100%" maxW="460px" bg="rgba(17,24,39,.97)" color="white" borderRadius="2xl" p={4} border="2px solid #22d3ee" boxShadow="0 18px 40px -12px rgba(0,0,0,.75)" role="alert">
          <HStack spacing={3} align="start">
            <Avatar size="sm" name={inv.from.name} bg="cyan.600" color="white" />
            <Box flex={1} minW={0}>
              <HStack spacing={2} wrap="wrap"><Text fontWeight={900}>{inv.from.name}</Text>{isFriend(inv.from.code) && <Badge colorScheme="yellow">Friend</Badge>}<Badge variant="subtle" colorScheme="cyan">📡 Nearby</Badge></HStack>
              <Text fontSize="sm" color="gray.200">invites you to {what(inv)}</Text>
              {inv.kind.k === "party" && inParty && <Text fontSize="xs" color="orange.200" mt={1}>Joining leaves the party you&apos;re in now.</Text>}
            </Box>
          </HStack>
          <HStack mt={3}>
            <Button flex={1} colorScheme="cyan" isLoading={busy === inv.cid} loadingText="Joining…" onClick={() => void join(inv)}>Join</Button>
            <Button flex={1} variant="ghost" color="gray.200" isDisabled={busy === inv.cid} onClick={() => { sound.play("click"); nearbyPlayers().decline(inv); }}>Not now</Button>
          </HStack>
        </Box>
      ))}
      {error && (
        <Box pointerEvents="auto" w="100%" maxW="460px" bg="red.900" color="white" borderRadius="xl" p={3} role="alert">
          <HStack><Text flex={1} fontSize="sm">{error}</Text><Button size="xs" variant="ghost" color="white" onClick={() => setError("")}>OK</Button></HStack>
        </Box>
      )}
    </VStack>
  );
}
